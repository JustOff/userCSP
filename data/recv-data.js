
// set Inferred CSP array of a website to userCSP Array
addon.port.on("setInferAsUserCSP", function (webDomain, inferredCSPArray, inferredCSPPolicies) { //receives data from main.js
console.log("setInferAsUserCSP message received: ", inferredCSPArray, inferredCSPPolicies);
	var selectedDomain = getSelectedDomain();
	document.getElementById("currentCSP").textContent = "set infer as userCSP";
    if (typeof(inferredCSPArray[webDomain]) === 'undefined') 
        return;

    if (typeof(inferredCSPPolicies[webDomain]) === 'undefined') 
        return;

    if (selectedDomain.match(webDomain)) {
        inferCSPAll[selectedDomain] = inferredCSPPolicies[selectedDomain];

        for (var i = 0; i < 13; i++) {
            if (inferredCSPArray[selectedDomain][i] !== null && inferredCSPArray[selectedDomain][i] !== "null") {
                inferCSPArray[selectedDomain][i] = inferredCSPArray[selectedDomain][i];
            } else {
                inferCSPArray[selectedDomain][i] ="";
            }
        }
    }
	
});


// Remove hostname received from main-add to domain names drop down box
addon.port.on("rmHost", function (hName) {                //from main.js, tabs.on(close)
    dump("\n Need to remove "+hName+" from drop down box");
    //console.log("rmHost message received: " + hName);
	var selectDomainList = document.getElementById("domainName");
    
    for(var i = selectDomainList.options.length-1; i >= 0; i--) {
        if (hName.indexOf(selectDomainList.options[i].value) !== -1) {
            selectDomainList.remove(i);
            console.log("rmHost message received: " + hName);
            // To handle the case of ActiveDomain removed: 
            //  Invoke domain change function to redisplay policy values
            getDomainChoice(null);
            break;
        }
    }
});


// // Helper function to set the Name of selected domain
function setSelectedDomain(activeDomain) {
    var dName = document.getElementById("domainName");  
	//console.log("Set selected domain called " + activeDomain);
    for(var i = 0; i < dName.options.length; i++) {
         if (activeDomain.indexOf(dName.options[i].value) !== -1) {
             dName.selectedIndex = i;
			 
             break;
         }
    } // end of FOR loop
} // end of setSelectedDomain


// Change Selected Domain to domain names drop down box
addon.port.on("changeActiveDomain", function (activeDomain) { //from main.js, tabs.on(activate) 
    try {
		//console.log("changeActiveDomain message received: " + activeDomain);
        setSelectedDomain(activeDomain);
		
        // Invoke domain change function to redisplay policy values
        getDomainChoice(null);
		
    } catch (e) { 
        dump("\n @@WARNING!! userCSP_UI.js is not yet initialized. So setSelctedDomain Doesn't exists");
    }
});


// Add CSP rules into global table
//receives data from main.js, userCSP_getRulesForOpenTabs(hostName)
addon.port.on("showCSPRules", function (activeWindow, websiteCSPList, websiteListArray, oldUIState, userCSPList, userCSPListArray,  inferRulesList, inferRulesListArray) {
        
    // Check global userCSPArray for data
    if (!userCSPArray || (userCSPArray === null) || typeof(userCSPArray) === "undefined") {
        userCSPArray = {};
    } 
    if (!userCSPAll || (userCSPAll === null) || typeof(userSPAll) === "undefined") {
        userCSPAll = {};
    } 
    if (!userCSPArray["all"]) {
        userCSPArray["all"] = new Array(20);
    }

    if (!websiteCSPArray || (websiteCSPArray === null) || typeof(websiteCSPArray) === "undefined") {
        websiteCSPArray = {};
    }

    if (!userCSPUIState || (userCSPUIState === null) || typeof(userCSPUIState) === "undefined") {
        userCSPUIState = {};
    }
    
    var dNames = document.getElementById("domainName"); //dNames = all
	
    //console.log("UI Globals: " , userCSPArray , userCSPAll , websiteCSPArray , userCSPUIState);
	
    setSelectedDomain(activeWindow);   

    for (var i = 0; i < dNames.options.length; i++) {
        //console.log("\nProcessing Domain Name = " + dNames.options[i].value);
        
        if (typeof(websiteListArray[dNames.options[i].value]) !== "undefined") {
            websiteCSPArray[dNames.options[i].value] = new Array(15);

            // store website defined CSP in global table 
            websiteCSPAll[dNames.options[i].value] = websiteCSPList[dNames.options[i].value];
			console.log("\n WebsiteCSPALL = " + websiteCSPAll[dNames.options[i].value]);
            
			for (var k = 0; k < 14; k++) {
                websiteCSPArray[dNames.options[i].value][k] = websiteListArray[dNames.options[i].value][k];              
            } // end of FOR Loop
        } // end of IF wesbiteListData Loop

        // Record oldUIState into userCSPUIState
        try {
            if (typeof(oldUIState) !== "undefined") {
                if (typeof(oldUIState[dNames.options[i].value]) !== "undefined") {
                    userCSPUIState[dNames.options[i].value] = oldUIState[dNames.options[i].value];
					console.log("Recorded UI State: " + oldUIState[dNames.options[i].value]);
                } else {
                    userCSPUIState[dNames.options[i].value] = 1; // Website CSP Policy by-default
                }
            }
        } catch (e) {
          console.log("\n\n Unsuccessful to record UI state\n");
        }
        // Record userCSP in Database
        try {
            if (typeof(userCSPList) !== "undefined") {
                if (typeof(userCSPList[dNames.options[i].value]) !== "undefined") {
                    userCSPAll[dNames.options[i].value] = userCSPList[dNames.options[i].value];
                   //console.log("\n\n Received userCSPAll = " + userCSPAll[dNames.options[i].value]);
                } else {
                   //console.log("\n (1) Received userCSPAll is EMPTY!!!");
                }
            } else {
              //console.log("\n (2) Received userCSPAll is EMPTY!!!");
            }

            //  //dump("\n Restoring CSP rules of Domain:"+dNames.options[i].value);
            if (userCSPListArray[dNames.options[i].value]) {
                for (var j = 0; j < 14; j++) {
                    // Restore userCSP array from Database
                    if ((userCSPListArray[dNames.options[i].value][j] === "null") || (typeof(userCSPListArray[dNames.options[i].value][j]) === "undefined")) {
                        userCSPArray[dNames.options[i].value][j] = "";
                    } else {
                        userCSPArray[dNames.options[i].value][j] = userCSPListArray[dNames.options[i].value][j];
                    }
                } // end of FOR loop "j"

            } // endof IF dListData Loop
        } catch (e) {
           console.log("\n Error in userCSP rule restoring in 'showCSPRules' event\n");        
        }

        // Infer CSP rules
        try {
            if (typeof(inferRulesList) !== 'undefined') {
                if (typeof(inferRulesList[dNames.options[i].value]) !== 'undefined')
                    inferCSPAll[dNames.options[i].value] = inferRulesList[dNames.options[i].value];                     
            }
            if (inferRulesListArray[dNames.options[i].value]) {
                inferCSPArray[dNames.options[i].value] = new Array(15);

            for (var k = 0; k < 13; k++) {
                inferCSPArray[dNames.options[i].value][k] = inferRulesListArray[dNames.options[i].value][k];              
            } // end of FOR Loop
        } // end of IF inferRulesListArray Loop
           console.log("inferCSPAll " + inferCSPAll + "inferCSPArray " + inferredCSPArray);   
        } 
		
		catch(e) {
           //console.log("ERROR!! inferRulesList in recv-data is not valid");
        }
        
    } // end of FOR loop "i"
    
    
    // Restore CSP rules for selected Domain
    restoreCSPRules();
	//console.log("showCSPRules message received for " + activeWindow);
}); // end of "showCSPRules" event listener


addon.port.on("addHost", function (hName, oldUIState) {
	var selectDomainList = document.getElementById("domainName");
	//console.log(selectDomainList);
	dump("hName = "+ hName);

    // Empty previous list
    selectDomainList.options.length = 0;

    document.getElementById("currentCSP").textContent = "";

    //2. Clear Directive contents
    document.getElementById("rule1").value = "";
    var listW = document.getElementById("rule1WebsiteList");
    listW.options.length = 0; // clear website list
    var listU = document.getElementById("rule1UserList");
    listU.options.length = 0; // clear user list
    // -----------------------------------------------------


    var anOption = document.createElement("OPTION");
    anOption.text = "*(Every Website)";
    anOption.value = "all";
    selectDomainList.add(anOption);
	
	// Check global userCSPArray for data
    if (!userCSPArray || userCSPArray === null) {
        dump("\n userCSPArray doesn't exists. So I need to create it ");
        userCSPArray = {};
    }
    if (!userCSPArray[anOption.value]) {
        userCSPArray[anOption.value] = new Array(20);

        // Set OLD UI State
        if (typeof(oldUIState) !== "undefined") {
            if (typeof(oldUIState[anOption.value] !== "undefined") || oldUIState[anOption.value] !== null) {
                userCSPUIState[anOption.value] = oldUIState[anOption.value];
            } else {
                userCSPUIState[anOption.value] = 1; // Defulat website Radio btn is selcted
            }
        } else {
                userCSPUIState[anOption.value] = 1; // Defulat website Radio btn is selcted
        }
    
       // document.getElementById("selectWebsiteCSPRuleBtn").checked = true;
    }

	// We need to add this domain elements to the Domain name Drop down box
    if (hName.length !== 0) {
        for (var i = 0; i < hName.length; i++) {
            anOption = document.createElement("OPTION");
            anOption.text = hName[i];
            anOption.value = hName[i];
            selectDomainList.add(anOption);

            // Add an entry into global userCSPArray if it doesn't exists
            if (!userCSPArray[anOption.value]) {
                userCSPArray[anOption.value] = new Array(20);

                // Set OLD UI State
                if (typeof(oldUIState) !== "undefined") {
                    if (typeof(oldUIState[anOption.value] !== "undefined") || oldUIState[anOption.value] !== null) {
                        userCSPUIState[anOption.value] = oldUIState[anOption.value];
                    } else {
                        userCSPUIState[anOption.value] = 1; // Default website is selected
                    }
                } else {
                    userCSPUIState[anOption.value] = 1; // Default website is selected
                }
                
                // document.getElementById("selectWebsiteCSPRuleBtn").checked = true;
            }

        } // end of FOR loop
    } //end of "hName.length" IF loop
	
	console.log("addHostName message received for " + hName);
	
});
