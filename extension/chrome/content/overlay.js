// Namespace, to avoid variable name collisions in global namespace
var Lovebird_NS = function() {
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
    
    onLoad: function() {
      LovebirdModule.startNewMailListener();
      LovebirdModule.loadEverybody(document);
    }, // end onLoad
    
    onUnload: function() {
      // TODO unregister listener and set lbTabDocument
      // back to null?
    },
    
    contextClick: function(event) {
      /* Called when you right-click a message and say 
       * "luv this person". Gets email address of sender
       * of selected message, adds it to favorites. */
      var selectedMsg = gFolderDisplay.selectedMessage;
      LovebirdModule.luvSenderOfMessage(selectedMsg);
    },
    
    personListClick: function(event) {
      let clickedEmail = event.originalTarget.getAttribute("lb_person_email");
      LovebirdModule.showEmailForPerson(clickedEmail);        
    },
    
    msgListDblClick: function(event) {
      let msgUri = event.originalTarget.getAttribute("lb_msg_uri");
      LovebirdModule.openReplyWindow(msgUri);
    },
    
    msgListClick: function(event) {
      let msgUri = event.originalTarget.getAttribute("lb_msg_uri");
      let browser = document.getElementById("lb-msg-body");
      
      /* We want to display the message body in the browser pane.
       * There's probably a right way to do this, but for now
       * here's a very silly hack involving a data URL. Replacing
       * newlines with <br> for readability is the extent of the
       * formatting.*/
      browser.setAttribute("src","data:text/html;charset=UTF-8,<html><head></head><body>" + LovebirdModule.getMessageBody(msgUri).replace(/\n/g, "<br>") + "</body></html>");
    },

    emailFieldKeyUp: function(event) {
      dump("You typed in the email field.\n");
    },
    
    toolbarAddButton: function() {
      var email = document.getElementById("lb-email-entry").value;
      
      /* Note: the field might autocomplete to something like:
       * Atul Varma <atul@mozillafoundation.org>
       * in which case we want to strip out what's inside <> */
      let re = /<(.+)>/;
      if (re.test(email)) {
        let result = re.exec(email);
        LovebirdModule.luvPersonByEmail(result[1]);
      } else {
        LovebirdModule.luvPersonByEmail(email);
      }
    },
    
    sortBy: function(sortOrder) {
      /* Sort function returning positive means put
       * the 2nd argument first, returning negative means put
       * the 1st argument first. */ 
      var sortFunction = null;
      switch(sortOrder) {
      case "oldest":
        sortFunction = function(a, b) {
          return a.lastMsg.date - b.lastMsg.date;
        }
        break;
      case "unanswered":
        // sort ones where the last message is TO me on top,
        // where last message is FROM me on the bottom.
        sortFunction = function(a, b) {
          if (a.lastMsg.from.value == myEmail && 
              b.lastMsg.from.value != myEmail) {
            return 1;
          } else if (a.lastMsg.from.value != myEmail &&
                     b.lastMsg.from.value == myEmail) {
            return -1;
          } else {
            return a.lastMsg.date - b.lastMsg.date;
          }
        }
        break;
      case "alphabetical":
        sortFunction = function(a, b) {
          if (a.personId.contact.name > b.personId.contact.name) {
            return 1;
          } else if (b.personId.contact.name > a.personId.contact.name) {
            return -1;
          } else {
            return 0;
          }
        }
        break;
      }
      
      LovebirdModule.sortPeopleWithFunction(sortFunction);
    } // end sortBy function
  }; // end public interface object
}(); // immediately call function to create namespace object