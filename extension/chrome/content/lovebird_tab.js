// Namespace, to avoid variable name collisions in global namespace
var Lovebird_NS = function() {
  // Private stuff goes here:
  const Cu = Components.utils;
  const Ci = Components.interfaces;
  const Cc = Components.classes;

  Cu.import("resource://lovebird/modules/lovebird_main.js");

  var readItTimer = null;

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
      LovebirdModule.shutItDown();
    },
    
    contextClick: function(event) {
      /* Called when you right-click a message and say 
       * "luv this person". Gets email address of sender
       * of selected message, adds it to favorites. */
      var selectedMsg = gFolderDisplay.selectedMessage;
      LovebirdModule.luvSenderOfMessage(selectedMsg);
    },
    
    personTreeSelect: function() {
      var view = document.getElementById("lb-ppl-tree").view;
      var rowIndex = view.selection.currentIndex; //returns -1 if the tree is not focused
      LovebirdModule.showEmailForPersonIndex(rowIndex);

      // Show text of most recent conversation with this person:
      var msgTree = document.getElementById("lb-msg-tree");
      msgTree.view.selection.select(0);
    },
    
    personTreeDblClick: function(event) {
      var tree = document.getElementById("lb-ppl-tree");
      var tbo = tree.treeBoxObject;
      
      // get the row, col and child element at the point
      var row = { }, col = { }, child = { };
      tbo.getCellAt(event.clientX, event.clientY, row, col, child);
      
      LovebirdModule.openNewEmailToPersonIndex(row.value);
    },

    msgTreeSelect: function() {
      // Show the contents of selected message thread in the <browser>
      var view = document.getElementById("lb-msg-tree").view;
      var rowIndex = view.selection.currentIndex;
      if (rowIndex != -1) {
        /* #lb-thread-view is a <browser> which has src= viewer.xhtml
         * Reach inside and get the DOM for the inner xhtml document,
         * then add a div for each message in the conversation. */
        let browserPane = document.getElementById("lb-thread-view");
        let innerDoc = browserPane.contentDocument;
        let msgList = innerDoc.getElementById('messagelist');
        let nuggets = LovebirdModule.getThreadContents(rowIndex);
        let threadTitle = document.getElementById("lb-thread-title");
        threadTitle.setAttribute("value", nuggets[0].subject);
        msgList.innerHTML = "";
        let newDiv;
        for (var i = nuggets.length -1; i >= 0; i--) {
          // Loop is backwards so newest will be on bottom
          newDiv = innerDoc.createElement("div");
          let divHdr = innerDoc.createElement("h2");
          let headerTxt = "";
          if (nuggets[i].from == LovebirdModule.myEmail) {
            newDiv.setAttribute("class", "lb-msg from-me");
            headerTxt = "Me";
          } else {
            newDiv.setAttribute("class", "lb-msg to-me");
            headerTxt = nuggets[i].name;
          }
          if (nuggets[i].isDraft) {
            headerTxt += " (Draft - not sent)";
          } else {
            headerTxt += "  -  " + nuggets[i].date;
          }
          divHdr.appendChild(innerDoc.createTextNode(headerTxt));
          newDiv.appendChild(divHdr);
          let lines = nuggets[i].body.split("\n");
          for (var j = 0; j < lines.length; j++) {
            newDiv.appendChild(innerDoc.createTextNode(lines[j]));
            newDiv.appendChild(innerDoc.createElement("br"));
          }
          msgList.appendChild(newDiv);
        }
        // Scroll newest message into view:
        newDiv.scrollIntoView(true);

        // If convo was unread, start timer to mark it read:
        if (LovebirdModule.getConvoForRow(rowIndex).hasUnread()) {
          this.countDownToMarkRead(rowIndex);
        }
      }
    },

    msgTreeClick: function(event) {
      var tree = document.getElementById("lb-msg-tree");
      var tbo = tree.treeBoxObject;
     
      // get the row, col and child element at the point
      var row = { }, col = { }, child = { };
      tbo.getCellAt(event.clientX, event.clientY, row, col, child);
      if (col.value) {
        if (col.value.id == "needsReplyColumn") {
          LovebirdModule.handleStarClick(row.value);
          this.refreshSelectedPerson();
        }
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

    adjustPplContextMenu: function() {
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

    adjustMsgContextMenu: function() {
      // adjust names of menu items depending on whether selected
      // item is needs-reply or unread/read.
      let contextMenu = document.getElementById("lb-msg-ctx-menu");
      let treeView = document.getElementById("lb-msg-tree").view;
      let rowIndex = treeView.selection.currentIndex;
      let convo = LovebirdModule.getConvoForRow(rowIndex);

      let hasUnread = convo.hasUnread();
      let needsReply = convo.needsReply();
      let needsReplyItem = document.getElementById("lb-toggle-needs-reply");
      let unreadItem = document.getElementById("lb-toggle-unread");
  
      // TODO this will be a pain come i18n time
      needsReplyItem.setAttribute("label", needsReply?"Mark Resolved":"Mark Needs Reply");
      unreadItem.setAttribute("label", hasUnread?"Mark Read":"Mark Unread");
    },

    refreshSelectedPerson: function() {
      var tree = document.getElementById("lb-ppl-tree");
      var view = tree.view;
      var rowIndex = view.selection.currentIndex;
      tree.treeBoxObject.invalidateRow(rowIndex);
    },
    
    pplCtxMenu: function(commandName) {
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
        LovebirdModule.markAllRead(rowIndex);
        document.getElementById("lb-msg-tree").treeBoxObject.invalidate();
        tree.treeBoxObject.invalidateRow(rowIndex);
        break;
        break;
        case "unluv":
        LovebirdModule.unLuvPersonIndex(rowIndex);
        break;
      }
    },
    
    msgCtxMenu: function(commandName) {
      var tree = document.getElementById("lb-msg-tree");
      var view = tree.view;
      var rowIndex = view.selection.currentIndex;

      // TODO same thing, assumes, selected msg is rightclicked msg
      switch (commandName) {
        case "reply":
        LovebirdModule.openReplyWindowForThread(rowIndex);
        break;
        break;
        case "newTab":
        LovebirdModule.openThreadNewTab(rowIndex);
        break;
        case "toggleNeedsReply":
        LovebirdModule.handleStarClick(rowIndex);
        tree.treeBoxObject.invalidateRow(rowIndex);
        this.refreshSelectedPerson();
        break;
        case "toggleRead":
        LovebirdModule.toggleOneRead(rowIndex);
        tree.treeBoxObject.invalidateRow(rowIndex);
        this.refreshSelectedPerson();
        break;
      }
    },

    sortBy: function(sortOrder) {
      LovebirdModule.sortPeopleBy(sortOrder);

      // Select somebody in the newly sorted list, so we're not
      // stuck looking at stale content:
      let pplTree = document.getElementById("lb-ppl-tree");
      pplTree.view.selection.select(0);
      this.personTreeSelect();
    },

    countDownToMarkRead: function(rowIndex) {
      // Start "you read this" timer:
      if (readItTimer != null) {
        window.clearTimeout(readItTimer);
      }
      var self = this;
      readItTimer = window.setTimeout(function() {
        let convo = LovebirdModule.getConvoForRow(rowIndex);
        convo.markRead(true);
        document.getElementById("lb-msg-tree").treeBoxObject.invalidate();
        self.refreshSelectedPerson();
        readItTimer = null;
      }, 2500);
    },

    hackery: function() {
      let button = document.getElementById("lovebird-luvperson");
      button.setAttribute("class", "toolbarbutton-1 luved");
      /*let mainList = document.getElementById("threadTree");
      mainList.addEventListener("select", function() {
        dump("Thread tree selecte event!\n");
      }, true);*/
    }
  }; // end public interface object
}(); // immediately call function to create namespace object