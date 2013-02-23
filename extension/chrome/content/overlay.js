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
    hackery: function() {
      let button = document.getElementById("lovebird-luvperson");
      button.setAttribute("class", "toolbarbutton-1 luved");
      let mainList = document.getElementById("threadTree");
      mainList.addEventListener("select", function() {
        dump("Thread tree select event!\n");
      }, true);
    },
    contextClick: function(event) {
      /* Called when you right-click a message and say 
       * "luv this person". Gets email address of sender
       * of selected message, adds it to favorites. */
      var selectedMsg = gFolderDisplay.selectedMessage;
      LovebirdModule.luvSenderOfMessage(selectedMsg);
    }
  }
})(); // for immediate execution