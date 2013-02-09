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
    
    personTreeSelect: function() {
      // replaces personListClick
      var view = document.getElementById("lb-ppl-tree").view;
      var rowIndex = view.selection.currentIndex; //returns -1 if the tree is not focused
      LovebirdModule.showEmailForPersonIndex(rowIndex);
    },
    
    personTreeDblClick: function(event) {
      // replaces personListDblClick
      var tree = document.getElementById("lb-msg-tree");
      var tbo = tree.treeBoxObject;
      
      // get the row, col and child element at the point
      var row = { }, col = { }, child = { };
      tbo.getCellAt(event.clientX, event.clientY, row, col, child);
      
      LovebirdModule.openNewEmailToPersonIndex(row.value);
    },

    msgTreeSelect: function() {
      var view = document.getElementById("lb-msg-tree").view;
      var rowIndex = view.selection.currentIndex; //returns -1 if the tree is not focused
      if (rowIndex != -1) {
        let browser = document.getElementById("lb-msg-body"); 

        /* We want to display the message body in the browser pane.
         * There's probably a right way to do this, but for now
         * here's a very silly hack involving a data URL. Replacing
         * newlines with <br> for readability is the extent of the
         * formatting.*/
        browser.setAttribute("src","data:text/html;charset=UTF-8," +
                           LovebirdModule.getHtmlForThread(rowIndex));
      }
    },

    msgTreeClick: function(event) {
      var tree = document.getElementById("lb-msg-tree");
      var tbo = tree.treeBoxObject;
     
      // get the row, col and child element at the point
      var row = { }, col = { }, child = { };
      tbo.getCellAt(event.clientX, event.clientY, row, col, child);
      if (col.value.id == "needsReplyColumn") {
        LovebirdModule.handleStarClick(row.value);
      }
    },

    msgTreeDblClick: function(event) {
      var tree = document.getElementById("lb-msg-tree");
      var tbo = tree.treeBoxObject;
      
      // get the row, col and child element at the point
      var row = { }, col = { }, child = { };
      tbo.getCellAt(event.clientX, event.clientY, row, col, child);
      
      LovebirdModule.openReplyWindowForThread(row.value);
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

    adjustContextMenu: function() {
      let contextMenu = document.getElementById("lb-ppl-ctx-menu");

      // Adjust options based on who is selected:
      var tree = document.getElementById("lb-ppl-tree");
      var view = tree.view;
      var rowIndex = view.selection.currentIndex; //returns -1 if the tree is not focused
      var name = view.getCellText(rowIndex,
                                  tree.columns.getColumnAt(1));
      if (rowIndex != -1) {
        for (var i = 0; i < contextMenu.childNodes.length; i++) {
          var menuItem = contextMenu.childNodes[i];
          var template = menuItem.getAttribute("labeltemplate");
          menuItem.setAttribute("label",
                                template.replace("$1", name));
        }
      }
    },
    
    ctxMenu: function(commandName) {
      // Find who was right-clicked;
      var tree = document.getElementById("lb-ppl-tree");
      var view = tree.view;
      var rowIndex = view.selection.currentIndex;

      // TODO this assumes that selected person always == rightclicked
      // person - is that ever not true?
      switch (commandName) {
        case "newMsg":
        LovebirdModule.openNewEmailToPersonIndex(rowIndex);
        break;
        case "markResolved":
        LovebirdModule.markAllResolved(rowIndex);
        document.getElementById("lb-msg-tree").treeBoxObject.invalidate();
        tree.treeBoxObject.invalidateRow(rowIndex);
        break;
        case "markRead":
        dump("TODO implement markRead.\n");
        break;
        case "merge":
        dump("TODO implement merge.\n");
        break;
        case "unluv":
        dump("TODO implement unluv.\n");
        break;
      }

    },

    sortBy: function(sortOrder) {
      LovebirdModule.sortPeopleBy(sortOrder);
    }
  }; // end public interface object
}(); // immediately call function to create namespace object