/* * Contributor(s):
 *   PATIL Kailas <patilkr24@gmail.com>
*/

// Click on Exit Link on UI
function exitCSP(e) {
    var mytext = "Successfully Exit from User CSP Add-on UI";
    addon.port.emit("exitUserCSP", mytext);
}

// Click on Report an Issue link on UI
function reportIssue(e) {
    addon.port.emit("reportIssue");
}



// Function to get inferred CSP Rule array from main 

function getInferCSPArray (webDomain) {
    addon.port.emit("inferCSPArray", webDomain);
}



function storeUserCSPUState(selectedDomain, userCSPUIState, flag, userCSPAll, userCSPArray) {
    addon.port.emit("storeUserCSPUIState", selectedDomain, userCSPUIState, flag, userCSPAll, userCSPArray);
}


function sendReportState(reportFlag) {
	addon.port.emit("updateReport", reportFlag);
}