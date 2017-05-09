var tabs = require("sdk/tabs");
var data = require("sdk/self").data;
const {URL} = require("sdk/url"); 
const {Cc,Ci,Cu,Cr,Cm,components} = require("chrome");
const xpcom = require("sdk/platform/xpcom");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

var ss = require("sdk/simple-storage"); // persistent data store APIs

var { ToggleButton } = require('sdk/ui/button/toggle');
var panels = require("sdk/panel");
var self = require("sdk/self");

// userCSP custom libraries
const userCSPcache = require("userCSP_cache");
const userCSPFilterMod = require("userCSP_filter");

var button = ToggleButton({
  id: "my-button",
  label: "SmartCSP",
  icon: {
    "16": "./CSP_logo-16.png",
    "48": "./CSP_logo-48_54.jpg",
    "64": "./CSP_logo-64.png"
  },
  onChange: handleChange
});

var panel = panels.Panel({
  width: 800,
  height: 450,
  contentURL: self.data.url("smartCSP_UI.html"),
  onHide: handleHide
});

function handleChange(state) {
  if (state.checked) {
    panel.show({
      position: button
    });
  }
}

function handleHide() {
  button.state('window', {checked: false});
}

// Simple-storage APIs 
// create persistent store to store user policies
if (!ss.storage.userCSPPolicies) {
    ss.storage.userCSPPolicies = {};
	//console.log("userCSPPolicies created");
}

if (!ss.storage.userCSPPoliciesArray) {
    ss.storage.userCSPPoliciesArray = {};
	//console.log("userCSPPoliciesArray created");
}

// Create persitent store for infer policy
if (!ss.storage.inferredPolicies) {
    ss.storage.inferredPolicies = {};
	//console.log("inferredPolicies created");
}

if (!ss.storage.inferredPoliciesArray) {
    ss.storage.inferredPoliciesArray = {};
	//console.log("inferredPoliciesArray created");
}

// userCSPState[]
// 1 = Website Policy
// 2 = User Policy
// 3 = Combined Policy
// 4 = Inferred Policy
if (!ss.storage.userCSPState) {
    ss.storage.userCSPState = {};
	//console.log("userCSPState created");
}

console.log("Simple Storage: ", ss.storage);


// Delete entries if we exceed 5M bytes of store
ss.on("OverQuota", function () {
  while (ss.quotaUsage > 1)
    ss.storage.pop();
    ss.storage.userCSPPoliciesArray.pop();
});


// ------ Global Variables ---------------------------------------
var websiteCSPRules = {}; // stores website defined CSP rules in array format
var websiteCSPFull = {}; // website CSP in unformatted 

var domainList = new Array();
var reportOnlyFlag = false;
var inferCSPFlag = true; // inferCSP policy flag
// ---------------------------------------------------------------
//console.log("Global variables initiated");


// Add event listener to Back/Forward Button and
// Read HTTP header (Content-Security-Policy) header from cache
userCSPcache.userCSPregisterBFbtnListener();


// RECEIVES DATA FROM send-data.js

// Exit userCSP UI
panel.port.on("exitUserCSP", function (text) {
  console.log("Exiting SmartCSP");
  panel.hide();
  //console.log("Simple Storage: %o", ss.storage);
});

// open new Tab to Report An Issue
panel.port.on("reportIssue", function () {
  tabs.open("https://github.com/patilkr/userCSP/issues");
  console.log("Opening Tab to Report Issue");
 });

 panel.port.on("updateReport", function (flag) {
	reportOnlyFlag = flag;
 });
 
panel.port.on("storeUserCSPUIState", function (selectedDomain, userCSPUIState, flag, userCSPAll, userCSPArray) {
    ss.storage.userCSPState[selectedDomain] = userCSPUIState[selectedDomain];
    if (flag) {
        if (!ss.storage.userCSPPolicies[selectedDomain])
            ss.storage.userCSPPolicies[selectedDomain] = userCSPAll[selectedDomain];
        
        if (!ss.storage.userCSPPoliciesArray[selectedDomain])
            ss.storage.userCSPPoliciesArray[selectedDomain] = new Array(20);
        
        try{
        for (var j = 0; j < 15; j++) {
            // Restore userCSP array from Database
            if ((userCSPArray[selectedDomain][j] === "null") || (typeof(userCSPArray[selectedDomain][j]) === "undefined")) {
                ss.storage.userCSPPoliciesArray[selectedDomain][j] = "";
            } else {
                ss.storage.userCSPPoliciesArray[selectedDomain][j] = userCSPArray[selectedDomain][j];
            }
        } // end of FOR loop "j"
        } catch(e) {
            
        }
    } //end of IF (flag) loop
	
    // Overwrite old User policy
    ss.storage.userCSPPolicies[selectedDomain] = userCSPAll[selectedDomain];
	console.log(ss.storage.userCSPPolicies);
    //console.log("userCSPPolicies[" + selectedDomain + "]=  ",  ss.storage.userCSPPolicies[selectedDomain]);
    console.log("storeUserCSPUIState: for " + selectedDomain + ": " + ss.storage.userCSPState[selectedDomain]);
});

//see recv-data.js
panel.port.on("inferCSPArray", function (webDomain) {
	//console.log("inferCSPArray called");
    panel.port.emit("setInferAsUserCSP",  webDomain, ss.storage.inferredPoliciesArray, ss.storage.inferredPolicies); 
});



// -------------------- Supplimentary Functions ---------------------
exports.userCSP_getRulesForTabs = function userCSPP_getRulesForTabs(hostName) {
    userCSP_getRulesForOpenTabs(hostName);
};

function searchStringInArray(hostName) {
    if (!domainList) return false;
    
    for (var j = 0; j < domainList.length; j++) {
        if (domainList[j].match(hostName)){
            //console.log("function searchStringInArray found: " + hostName);
			return true;}
    }
    return false;
} // end of "searchStringInArray"

// helper function to get currently active domain
function getActiveDomain() {
    if (tabs.activeTab.url === "about:blank") return;
    if (!(URL(tabs.activeTab.url).host)) return;

    if ((URL(tabs.activeTab.url).scheme === "http") || (URL(tabs.activeTab.url).scheme === "https")) {
        var activeWindow = URL(tabs.activeTab.url).scheme + "://" +URL(tabs.activeTab.url).host;
        // domainNameRules.activeDomain = activeWindow;
        //console.log("function getActiveDomain called");
		return activeWindow;
    }
} // end of getActiveDomain() function

function userCSP_getRulesForOpenTabs(hostName) {
    var tempStr;

    // reset the domainList array
    domainList = new Array();

    for (var i = 0; i < tabs.length; i++) {
          //console.log("scheme="+URL(tabs[i].url).scheme);
        tempStr = URL(tabs[i].url).scheme + "://" + URL(tabs[i].url).host;
        if (!searchStringInArray(tempStr)) {
            // Not found, so insert it in array
            domainList.push(tempStr);
            //console.log(tempStr + " will be sent to UI");

            // infer Policy
            // simple-storage usage for inferCSP policy
            if (!ss.storage.inferredPoliciesArray[tempStr]) {
                ss.storage.inferredPoliciesArray[tempStr] = new Array(15);
                ss.storage.inferredPoliciesArray[tempStr][0] = "'self'";
                ss.storage.inferredPoliciesArray[tempStr][9] = "*";
            }

            var newResult = "";

            for (var j = 0; j < 13; j++) {
                if (!ss.storage.inferredPoliciesArray[tempStr][j])
                    continue;

                newResult = userCSPFilterMod.addCSPDirectiveNames(newResult, j + 1, ss.storage.inferredPoliciesArray[tempStr][j]);

            }
			ss.storage.inferredPolicies[tempStr] = newResult;
			console.log("Rules for open tabs: " + ss.storage.inferredPolicies[tempStr]);
            // Simple-storage; Store single inferred policy
            

        } // end of IF loop
    } // end of FOR loop

    //console.log("Sending domainList: "+domainList);
    panel.port.emit("addHost", domainList, ss.storage.userCSPState);

    // Currently active domain- default: Every
    var activeWindow = "all";
    // Function to get currently active domain name
    activeWindow = getActiveDomain();

    // send record to add-on UI
    panel.port.emit("showCSPRules", activeWindow, websiteCSPFull, websiteCSPRules, ss.storage.userCSPState, ss.storage.userCSPPolicies, ss.storage.userCSPPoliciesArray, ss.storage.inferredPolicies, ss.storage.inferredPoliciesArray);
	//console.log("function userCSP_getRulesForOpenTabs called");
} // end of userCSP_getRulesForOpenTabs() function

function getBrowserFromChannel(aChannel) {
  try {
    var notificationCallbacks = 
      aChannel.notificationCallbacks ? aChannel.notificationCallbacks : aChannel.loadGroup.notificationCallbacks;
 
    if (!notificationCallbacks)
      return null;
 
    var domWin = notificationCallbacks.getInterface(Ci.nsIDOMWindow);
     //console.log("function getBrowserFromChannel called");
	  return domWin.document;
     // return gBrowser.getBrowserForDocument(domWin.top.document);
  }
  catch (e) {
   // console.log("###Error: Cannot get Origin URI of request generator in main.js"+ e + "\n");
    return null;
  }
} // end of getBrowserFromChannel() function


// ---------------------- Event Listeners ----------------------------------

// Use "tabs" API's event handler
// Tabs "READY" event: emitted when DOM contents are ready
tabs.on('ready', function(evtTab) {
    if (evtTab.url !== "about:blank") {  

        if (!(URL(evtTab.url).host) || URL(evtTab.url).host === null) // if host is null
            return;

        if (URL(evtTab.url).scheme === "about") 
            return;
        
        var hostName = URL(evtTab.url).scheme + "://" + URL(evtTab.url).host;
        
             

        console.log("Number of open tabs=" + tabs.length);
        //console.log("DOMContentLoaded:" + hostName);

        userCSP_getRulesForOpenTabs(hostName);
    } // end of "evetTab.url" IF loop
});

//  Tabs "activate" Event: Emitted when the tab is made active 
tabs.on('activate', function(evtTab) {
    // Currently active domain- default: Every
    var activeWindow = "all";

    // Function to get currently active domain name
     activeWindow = getActiveDomain();
     if (typeof(activeWindow) !== "undefined") {
        console.log("Tab Changed to: " + activeWindow);
        panel.port.emit("changeActiveDomain", activeWindow);
    }
});


// Tabs "Close" event: Emitted when tab is closed
tabs.on('close', function(evtTab) {
    if (evtTab.url !== "about:blank") {
         console.log("Window Closed:" + evtTab.url + "\n Index = " + evtTab.index);
        var hostName = URL(evtTab.url).scheme + "://" + URL(evtTab.url).host;

        var temp = "";
        var notFound = true;
        
        for (var i = 0; i < tabs.length; i++) {
            if (tabs[i].url === "" || tabs[i].url === "about:blank")
                continue;

            temp = URL(tabs[i].url).scheme + "://" + URL(tabs[i].url).host;
            
            if (temp !== null) {
                if (temp.indexOf(hostName) !== -1) {
                     console.log("\n Duplicate Tab is closed so nothing to do");
                    notFound = false;
                    break;
                }
            }
        }

        if (notFound) {
            try {
                if (!domainList) return;
                if (!domainList.length) return;
                
                for (var i = 0; i < domainList.length; i++) {
                    if (domainList[i] !== null) {
                        if (domainList[i].match(hostName)) {
// remove the element
                            domainList.splice(i, 1);
                             console.log(hostName + " is sent for removal");
                            // send it to add-on UI to remove it
                            panel.port.emit("rmHost", hostName);
                        }
                    }
                }
            } catch (e) {
            }
        } // end of IF notFound Loop      
      console.log("Open Tabs: " + domainList);

    } // end of "evtTab.url" IF loop
});



// function to examine the DOM of the webpage and enforce policies
function httpExamineCallback(aSubject, aTopic, aData) {
    var httpChannel = aSubject.QueryInterface(Ci.nsIHttpChannel);
    if (httpChannel.responseStatus === 200) {
        var doc = getBrowserFromChannel(httpChannel);
        if (doc === null) // if its null then no document available
            return;
		//console.log(doc);
        var hostName = doc.location.protocol + "//" + doc.location.host;

        var responseName = httpChannel.URI.scheme + "://" + httpChannel.URI.host;
        //console.log("HTTP Handler; hostName = " + hostName);
        //console.log("responseName = " + responseName);

       
        // Check for website CSP rules
        var cspRules;
        // 0 = Website Doesn't specify header
        // 1 = Website used Content-Security-Policy Header
        // 2 = Website used X-Content-Security-Policy Header
        var websiteHeaderState = 0; 
        try {
            cspRules = httpChannel.getResponseHeader("Content-Security-Policy");
            websiteHeaderState = 1;
        } catch (e) { // catch 1
            try {
                cspRules = httpChannel.getResponseHeader("X-Content-Security-Policy");    // Fallback mechanism support 
                websiteHeaderState = 2;
            } catch (e) { //catch 2
                try {
                    cspRules = httpChannel.getResponseHeader("X-Content-Security-Policy-Report-Only"); // report-only mechanism support 
                    websiteHeaderState = 3;
                } catch (e) { // catch 3
                    try {
                        cspRules = httpChannel.getResponseHeader("Content-Security-Policy-Report-Only"); // report-only mechanism support 
                        websiteHeaderState = 4;
                    } catch (e) { // catch 4
                        websiteHeaderState = 0;
                    }
                } // end of catch 3
            } // end of inner catch 2
        } // end of outer catch 1
	if (reportOnlyFlag) {
		websiteHeaderState = 4;
	}
	
	//console.log("Web Header State: " + websiteHeaderState);
        try {
            // CSP  set by website
            if (cspRules) {
                console.log("Website Specified CSP Rules= " + cspRules);
                websiteCSPRules[responseName] = new Array(15);
                websiteCSPFull[responseName] = cspRules;
                for (var i = 0; i < 14; i++) {
                    websiteCSPRules[responseName][i] = userCSPFilterMod.cspDirectiveFilter(cspRules, i, true);
                }
            }
        } catch (e) {
            console.log("\nERROR: Either website hasn't specified CSP rules or some code error exists. ");
        }
	//console.log("Pre switch: " + ss.storage.userCSPState[responseName]);
        // ------------ Enforce Rules -------------
        switch (ss.storage.userCSPState[responseName]) {
            case 0: //Default State: No Policy Applied
			break;
			
			case 1: // Website Policy
                // Nothing to Do.
                console.log("\n\n\n NOTHING to Do. Website Policy Enforced\n");
                break;
				
            case 2: // User Defined Policy
                if (typeof(ss.storage.userCSPPolicies[responseName]) !== "undefined") {
                    if (ss.storage.userCSPPolicies[responseName] !== null || ss.storage.userCSPPolicies[responseName] !== "") {
                        if (websiteHeaderState === 0 || websiteHeaderState === 1) {
                            httpChannel.setResponseHeader("Content-Security-Policy", ss.storage.userCSPPolicies[responseName], false);
                        } else if (websiteHeaderState === 2) {
                            httpChannel.setResponseHeader("X-Content-Security-Policy", ss.storage.userCSPPolicies[responseName], false);
                        } else if (websiteHeaderState === 3) {
                            httpChannel.setResponseHeader("X-Content-Security-Policy-Report-Only", ss.storage.userCSPPolicies[responseName], false);
                        } else if (websiteHeaderState === 4) {
                            httpChannel.setResponseHeader("Content-Security-Policy-Report-Only", ss.storage.userCSPPolicies[responseName], false);
			            } 
                        console.log("\n\n\n UserCSP policy enforced. Enforced Policy = ", ss.storage.userCSPPolicies[responseName] + "\n");
                    }
              }    								
				else if (typeof(ss.storage.userCSPPolicies[responseName]) === "undefined" || ss.storage.userCSPPolicies[responseName] === null || ss.storage.userCSPPolicies[responseName] === "") {
					//console.log("called ", ss.storage.userCSPPolicies[responseName]);
					var hostAll = "all";
					if (websiteHeaderState === 0 || websiteHeaderState === 1) {
                            httpChannel.setResponseHeader("Content-Security-Policy", ss.storage.userCSPPolicies[hostAll], false);
                        } else if (websiteHeaderState === 2) {
                            httpChannel.setResponseHeader("X-Content-Security-Policy", ss.storage.userCSPPolicies[hostAll], false);
                        } else if (websiteHeaderState === 3) {
                            httpChannel.setResponseHeader("X-Content-Security-Policy-Report-Only", ss.storage.userCSPPolicies[hostAll], false);
                        } else if (websiteHeaderState === 4) {
                            httpChannel.setResponseHeader("Content-Security-Policy-Report-Only", ss.storage.userCSPPolicies[hostAll], false);
                        } 
						console.log("\n\n\n UserCSP Global policy enforced. Enforced Policy = ", ss.storage.userCSPPolicies[hostAll] + "\n");
					}				
                break;
      
            case 3: // Combined Policy
                if (typeof(ss.storage.userCSPPoliciesArray[responseName]) !== "undefined") {
                    if (ss.storage.userCSPPoliciesArray[responseName][13] !== null || ss.storage.userCSPPoliciesArray[responseName][13] !== "") {
                        if (websiteHeaderState === 0 || websiteHeaderState === 1) {
                            httpChannel.setResponseHeader("Content-Security-Policy", ss.storage.userCSPPoliciesArray[responseName][13], false);
                        } else if (websiteHeaderState === 2) {
                            httpChannel.setResponseHeader("X-Content-Security-Policy", ss.storage.userCSPPoliciesArray[responseName][13], false);
                        } else if (websiteHeaderState === 3) {
                            httpChannel.setResponseHeader("X-Content-Security-Policy-Report-Only", ss.storage.userCSPPoliciesArray[responseName][13], false);
                        } else if (websiteHeaderState === 4) {
                            httpChannel.setResponseHeader("Content-Security-Policy-Report-Only", ss.storage.userCSPPoliciesArray[responseName][13], false);
                        }
                        console.log("\n\n\n UserCSP LOOSE policy enforced. Enforced Policy = ", ss.storage.userCSPPoliciesArray[responseName][13] + "\n");
                    }
                }
				break;
				
            case 4: // Inferred Policy
                if (typeof(ss.storage.inferredPolicies[responseName]) !== "undefined") {
                    if (ss.storage.inferredPolicies[responseName] !== null || ss.storage.inferredPolicies[responseName] !== "") {
                        if (websiteHeaderState === 0 || websiteHeaderState === 1) {
                            httpChannel.setResponseHeader("Content-Security-Policy", ss.storage.inferredPolicies[responseName], false);
                        } else if (websiteHeaderState === 2) {
                            httpChannel.setResponseHeader("Content-Security-Policy", ss.storage.inferredPolicies[responseName], false);
                        } else if (websiteHeaderState === 3) {
                            httpChannel.setResponseHeader("X-Content-Security-Policy-Report-Only", ss.storage.inferredPolicies[responseName], false);
                        } else if (websiteHeaderState === 4) {
                            httpChannel.setResponseHeader("Content-Security-Policy-Report-Only", ss.storage.inferredPolicies[responseName], false);
                        }
                        console.log("\n\n\n Inferred Policy Enforced. enforce Policy = ", ss.storage.inferredPolicies[responseName] + "\n");
                    }
                }
                break;
        } // end of switch


    } // end of responseStatus == 200 IF loop
} // end of  httpExamineCallback() function

// Register observer service for http events
var observerService = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
	observerService.addObserver(httpExamineCallback, "http-on-examine-response", false);   
	
	
	
// Helper function to add domain to the infer list
function addRuleToInferList(hostName, contType, contLoc) {
    try {
//console.log("Add Rule to Infer List");
        if (!ss.storage.inferredPoliciesArray[hostName]) {
            ss.storage.inferredPoliciesArray[hostName] = new Array(15);
            ss.storage.inferredPoliciesArray[hostName][0] = "'self'";
            ss.storage.inferredPoliciesArray[hostName][9] = "*";
        }

    } catch (e) {
      //  console.log ("\n EXCEPTION in main.js: ss.storage.inferredPoliciesArray caused Exception!!! e = " + e);
    }

    var contURL = contLoc.scheme + "://" + contLoc.host;

    switch(contType) {    
    case 2: // script-src

        // using simple-storage
        if (!ss.storage.inferredPoliciesArray[hostName][1])
            ss.storage.inferredPoliciesArray[hostName][1] = "'self'";
        if (ss.storage.inferredPoliciesArray[hostName][1].indexOf(contURL) === -1) {
            ss.storage.inferredPoliciesArray[hostName][1] += " ";
            ss.storage.inferredPoliciesArray[hostName][1] += contURL;
            console.log("Infer Rule!! " + hostName+ " script-src ="+ ss.storage.inferredPoliciesArray[hostName][1]);
        }

        break
    case 3: // img-src

        // using simple-storage
        if (!ss.storage.inferredPoliciesArray[hostName][3])
            ss.storage.inferredPoliciesArray[hostName][3] = "'self'";
        if (ss.storage.inferredPoliciesArray[hostName][3].indexOf(contURL) === -1) {
            ss.storage.inferredPoliciesArray[hostName][3] += " ";
            ss.storage.inferredPoliciesArray[hostName][3] += contURL;
            console.log("Infer Rule!! " + hostName+ " img-src ="+ ss.storage.inferredPoliciesArray[hostName][3]);
        }

        break;
    case 4: // style-src

        // using simple-storage
        if (!ss.storage.inferredPoliciesArray[hostName][5])
            ss.storage.inferredPoliciesArray[hostName][5] = "'self'";
        if (ss.storage.inferredPoliciesArray[hostName][5].indexOf(contURL) === -1) {
            ss.storage.inferredPoliciesArray[hostName][5] += " ";
            ss.storage.inferredPoliciesArray[hostName][5] += contURL;
            console.log("Infer Rule!! " + hostName+ " style-src ="+ ss.storage.inferredPoliciesArray[hostName][5]);
        }

        break;
    case 5: // object-src

        // using simple-storage
        if (!ss.storage.inferredPoliciesArray[hostName][2])
            ss.storage.inferredPoliciesArray[hostName][2] = "";
        if (ss.storage.inferredPoliciesArray[hostName][2].indexOf(contURL) === -1) {
            ss.storage.inferredPoliciesArray[hostName][2] += " ";
            ss.storage.inferredPoliciesArray[hostName][2] += contURL;
            console.log("Infer Rule!! " + hostName+ " object-src ="+ ss.storage.inferredPoliciesArray[hostName][2]);
        }

        break;
    case 6: // document-src

        // using simple-storage
        if (!ss.storage.inferredPoliciesArray[hostName][0])
            ss.storage.inferredPoliciesArray[hostName][0] = "";
        if (ss.storage.inferredPoliciesArray[hostName][0].indexOf(contURL) === -1) {
            ss.storage.inferredPoliciesArray[hostName][0] += " ";
            ss.storage.inferredPoliciesArray[hostName][0] += contURL;
            console.log("Infer Rule!! " + hostName+ " default-src ="+ ss.storage.inferredPoliciesArray[hostName][0]);
        }

        break;
    case 7: // child-src

        // using simple-storage
        if (!ss.storage.inferredPoliciesArray[hostName][6])
            ss.storage.inferredPoliciesArray[hostName][6] = "";
        if (ss.storage.inferredPoliciesArray[hostName][6].indexOf(contURL) === -1) {
            ss.storage.inferredPoliciesArray[hostName][6] += " ";
            ss.storage.inferredPoliciesArray[hostName][6] += contURL;
            console.log("Infer Rule!! " + hostName+ " child-src ="+ ss.storage.inferredPoliciesArray[hostName][6]);
        }

        break;
    case 11: // xhr-src or connect-src

        // using simple-storage
        if (!ss.storage.inferredPoliciesArray[hostName][8])
            ss.storage.inferredPoliciesArray[hostName][8] = "";
        if (ss.storage.inferredPoliciesArray[hostName][8].indexOf(contURL) === -1) {
            ss.storage.inferredPoliciesArray[hostName][8] += " ";
            ss.storage.inferredPoliciesArray[hostName][8] += contURL;
            console.log("Infer Rule!! " + hostName+ " connect-src ="+ ss.storage.inferredPoliciesArray[hostName][8]);
        }

        break;
    case 14: // font-src

        // using simple-storage
        if (!ss.storage.inferredPoliciesArray[hostName][7])
            ss.storage.inferredPoliciesArray[hostName][7] = "";
        if (ss.storage.inferredPoliciesArray[hostName][7].indexOf(contURL) === -1) {
            ss.storage.inferredPoliciesArray[hostName][7] += " ";
            ss.storage.inferredPoliciesArray[hostName][7] += contURL;
            console.log("Infer Rule!! " + hostName+ " font-src ="+ ss.storage.inferredPoliciesArray[hostName][7]);
        }
            break;
        case 15: // media-src

        // using simple-storage
        if (!ss.storage.inferredPoliciesArray[hostName][4])
            ss.storage.inferredPoliciesArray[hostName][4] = "";
        if (ss.storage.inferredPoliciesArray[hostName][4].indexOf(contURL) === -1) {
            ss.storage.inferredPoliciesArray[hostName][4] += " ";
            ss.storage.inferredPoliciesArray[hostName][4] += contURL;
            console.log("Infer Rule!! " + hostName+ " media-src ="+ ss.storage.inferredPoliciesArray[hostName][4]);
        }

        break;
    } // end of switch
} // end of function addRuleToInferList()
	

let policy =
{
  classDescription: "Test content policy",
  classID: components.ID("{12345678-1234-1234-1234-123456789abc}"),
  contractID: "@mozilla.org/test-policy;1",
  xpcom_categories: ["content-policy"],

  init: function()
  {
    let registrar = Cm.QueryInterface(Ci.nsIComponentRegistrar);
    registrar.registerFactory(this.classID, this.classDescription, this.contractID, this);

    let catMan = Cc["@mozilla.org/categorymanager;1"].getService(Ci.nsICategoryManager);
    for each (let category in this.xpcom_categories)
      catMan.addCategoryEntry(category, this.contractID, this.contractID, false, true);
    },

  // nsIContentPolicy interface implementation
    shouldLoad: function (contType, contLoc, reqOrig, ctx, typeGuess, extra) {
      //console.log("Should load called, content type ", contType, contLoc.host);
	  
	  if (!inferCSPFlag)
          return Ci.nsIContentPolicy.ACCEPT;

      if (typeof(reqOrig.scheme) === 'undefined')
          return Ci.nsIContentPolicy.ACCEPT;

      if (typeof(contLoc.scheme) === 'undefined')
          return Ci.nsIContentPolicy.ACCEPT;

      if (contLoc.scheme === "http" || contLoc.scheme === "https") {
          if (reqOrig.scheme === "http" || reqOrig.scheme === "https") {
              var hostName =  reqOrig.scheme + "://" + reqOrig.host;
              
             //console.log("Both contLoc and reqOrigin scheme = http || https");           

              addRuleToInferList(hostName, contType, contLoc);
          } // end of req.Orig IF Loop
          else {
              var hostName = contLoc.scheme + "://" + contLoc.host;
              if (contType === 6) {
                  //console.log("New page load request contType == 6, contLoc = " + hostName);
                  try {

                      if (!ss.storage.inferredPoliciesArray[hostName]) {
                          ss.storage.inferredPoliciesArray[hostName] = new Array(15);
                          ss.storage.inferredPoliciesArray[hostName][0] = "'self'";
                          ss.storage.inferredPoliciesArray[hostName][9] = "*";
                      }

                  } catch(e) { 
                      //console.log(" ERROR!! "+e);
                  }
              } // contType ==6 IF loop
          }
      } // end of contLoc IF loop


      return Ci.nsIContentPolicy.ACCEPT;
  },
 
  shouldProcess: function (contType, contLoc, reqOrig, ctx, mimeType, extra) {
      console.log(" shouldProcess works!!!");
      return Ci.nsIContentPolicy.ACCEPT;
  },
  // nsIFactory interface implementation
  createInstance: function(outer, iid)
  {
    if (outer)
      throw Cr.NS_ERROR_NO_AGGREGATION;
    return this.QueryInterface(iid);
  },

  // nsISupports interface implementation
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIContentPolicy, Ci.nsIFactory])
};

policy.init();

// Add-on Unload Routine
require("sdk/system/unload").when(function() { 
    // Unregister content policy
    catman.deleteCategoryEntry("content-policy", policy.contractID, false);   
 });
