// Namespace, to avoid variable name collisions in global namespace
var Lovebird_Overlay = (function() {
  // Private stuff goes here:
  const Cu = Components.utils;
  const Ci = Components.interfaces;
  const Cc = Components.classes;

  Cu.import("resource://lovebird/modules/lovebird_main.js");

  // Public interface:
  return {
    openTab: function() {
      LovebirdModule.openLovebirdTab();
    },

    heartButtonClick: function() {
      let selectedMsg = gFolderDisplay.selectedMessage;
      let button = document.getElementById("lovebird-luvperson");
      if (LovebirdModule.senderIsLoved(selectedMsg)) {
        // If they're luved, unluv them, clear out heart
        emailAddr = LovebirdModule.cleanEmailAddr(selectedMsg.author);
        LovebirdModule.unLuvPerson(emailAddr);
        button.setAttribute("class", "unluved");
      } else {
        // if they're not luved, luv them, add heart
        LovebirdModule.luvSenderOfMessage(selectedMsg);
        button.setAttribute("class", "luved");
      }
    },

    contextClick: function(event) {
      /* Called when you right-click a message and say 
       * "luv this person". Gets email address of sender
       * of selected message, adds it to favorites. */
      let selectedMsg = gFolderDisplay.selectedMessage;
      LovebirdModule.luvSenderOfMessage(selectedMsg);
    },
    
    registerMainUiListener: function() {
      let mainList = document.getElementById("threadTree");
      mainList.addEventListener("select", function() {
        // Called whenever user selects a different message in main
        // email view
        let selectedMsg = gFolderDisplay.selectedMessage;
        let button = document.getElementById("lovebird-luvperson");
        // Set icon of heart button to show whether sender is
        // currently in lovebird list or not
        let luved = LovebirdModule.senderIsLoved(selectedMsg);
        button.setAttribute("class", luved?"luved":"unluved");
      }, true);
    },

    unRegisterMainUiListener: function() {
    }
  }
})(); // for immediate execution

window.addEventListener("load", function() {
  dump("Window load handler called.\n");
  Lovebird_Overlay.registerMainUiListener();
});
