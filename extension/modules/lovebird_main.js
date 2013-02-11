EXPORTED_SYMBOLS = ["LovebirdModule"];

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;

Cu.import("resource://lovebird/modules/name_store.js");
Cu.import("resource:///modules/gloda/public.js");
Cu.import("resource:///modules/mailServices.js"); // needed for MailServices.compose etc.
Cu.import("resource://gre/modules/Services.jsm"); // needed for Services.io etc.


function getMsgHdr(msgUri) {
//  let msgURI = Services.io.newURI(msgUri, null, null);
  let messenger = Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);
  // Get the message database header for the given message uri:
  return messenger.msgHdrFromURI(msgUri);
}

function getMessageBody(msgUri) {
  let aMessageHeader = getMsgHdr(msgUri);
  let listener = Cc["@mozilla.org/network/sync-stream-listener;1"]
    .createInstance(Ci.nsISyncStreamListener);
  
  // does this give us back the original msgUri and if so can we
  // skip this step?
  let uri = aMessageHeader.folder.getUriForMsg(aMessageHeader);
  let messenger = Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);
  messenger.messageServiceFromURI(uri)
    .streamMessage(uri, listener, null, null, false, "");
  let folder = aMessageHeader.folder;
  return folder.getMsgTextFromStream(listener.inputStream,
                                     aMessageHeader.Charset,
                                     65536,
                                     32768,
                                     false,
                                     true,
                                     { });
}


function addTreeProp(props, value) {
  // This uses a really weird API...
  let atomService = Cc["@mozilla.org/atom-service;1"].getService(Ci.nsIAtomService);
  props.AppendElement(atomService.getAtom(value));
}


function Convo(convoId) {
  this.id = convoId;
  /*this.lastMsgDate = null;
  this.pendingDraft = false;
  this._lastSenderIsMe = false;*/
  this._hasUnread = false;
  this._needsReplyFlag = true;
  
  // Have we stored a user pref about whether this convo needs
  // a reply?
  let self = this;
  LovebirdNameStore.getConvoStatus(this.id, function(status) {
    if (status == -1) {
      // status never set before
      self._needsReplyFlag = true;
    } else {
      switch(status) {
        case 0:
        self._needsReplyFlag = false;
        break;
        case 1:
        self._needsReplyFlag = true;
      }
    }
  });

  this.msgColls = [];
}
Convo.prototype = {
  addMsg: function(msgColl, isNew) {
    // assert msgColl.conversationID === this.id ?
    
    if (isNew) {
      let lastDate = this.getLastMsgDate();
      if (lastDate == 0 || msgColl.date > lastDate) {
        /* is this new and is it newer than anything else in convo?
         * If it's an outgoing message from me, default is that
         * convo no longer needs reply. If it's an incoming message
         * from someone else, assume it does need reply. */
        if (msgColl.from.value == LovebirdModule.myEmail) {
          this.markNeedsReply(false);
        } else {
          this.markNeedsReply(true);
        }
      }
      /* TODO we might miss some this way -- is it better to
       * timestamp whenever user manually sets flag, and compare
       * date of incoming message to last time user set flag? */
    }

    this.msgColls.unshift(msgColl);

    // TODO sort these somewhere?

    // if it's a draft, set this.pendingDraft.
    // TODO How to know if it's draft?

    if (!msgColl.read) {
      this._hasUnread = true;
    }
  },
  
  getThreadTextAsHtml: function() {
    var html = "<html><head></head><body>";
    for (var i = 0; i < this.msgColls.length; i++) {
      var uri = this.msgColls[i].folderMessageURI;
      html += getMessageBody(uri).replace(/\n/g, "<br>");
      html += "<hr>";
    }
    html+= "</body></html>";
    return html;
  },

  markRead: function(newVal) {
    this._hasUnread = newVal;
    // also mark the unread message itself read?
  },
  
  markNeedsReply: function(newVal) {
    this._needsReplyFlag = newVal;
    var statusCode = (this._needsReplyFlag)?1:0;
    // Persist:
    LovebirdNameStore.rememberConvoStatus(this.id, statusCode);
  },

  toggleNeedsReply: function() {
    this.markNeedsReply( !this._needsReplyFlag );
  },

  needsReply: function() {
    return this._needsReplyFlag;
  },

  lastMsgIsFromMe: function() {
    // TODO in the future maybe myEmail can have more than
    // one email - it's sent if it's from any of them.
    return (this.msgColls[0].from.value == LovebirdModule.myEmail);
  },

  getStatus: function() {
    // return values match css class names for rows
    if (this.lastMsgIsFromMe()) {
      return "sent";
    } else {
      return "unanswered";
    }
  },

  getLastMsgDate: function() {
    if (this.msgColls.length > 0) {
      return this.msgColls[0].date;
    } else {
      return 0;
    }
  },
  
  getSubject: function() {
    return this.msgColls[0].subject;
  },

  getLastMsgUri: function() {
    return this.msgColls[0].folderMessageURI;
  },

  hasUnread: function() {
    return this._hasUnread;
  },

  hasDraft: function() {
    let msgHdr = getMsgHdr(this.getLastMsgUri());
    // If it's a draft, it will be inside a folder named "Drafts"
    // future TODO: only in the English version!
    return (msgHdr.folder.name == "Drafts");
  }
};

function Peep(identity) {
  this.identity = identity;
  this.conversations = {}; // keyed by conversationId

  // useful msg properties: from.value, to[0].value,
  // .subject, .date, .folderMessageURI
  this._convosAreSorted = false;
  this._sortedConvos = [];
}
Peep.prototype = {
  addMessage: function(msgColl, isNew) {
    // Use the conversation ID to figure out which conversation
    // this message belongs in:
    var convId = msgColl.conversationID;
    if (!this.conversations[convId]) {
      this.conversations[convId] = new Convo(convId);
    }
    this.conversations[convId].addMsg(msgColl, isNew);
    this._convosAreSorted = false;
  },

  clearHistory: function() {
    this.conversations = {};
  },

  getConversations: function() {
    // return conversation list sorted by date. but be lazy about it.
    if (!this._convosAreSorted) {
      this._sortedConvos = [];
      for (var convId in this.conversations) {
        this._sortedConvos.push(this.conversations[convId]);
      }
      // This is just sorting with newest convos on top...
      // TODO maybe consider stars or reply status when sorting?
      this._sortedConvos.sort(function(a, b) {
        return b.getLastMsgDate() - a.getLastMsgDate();
      });
      this._convosAreSorted = true;
    }
    return this._sortedConvos;
  },

  getName: function() {
    return this.identity.contact.name;
  },

  getEmailAddr: function() {
    return this.identity.value;
  },

  getStatus: function() {
    return this.getConversations()[0].getStatus();
  },

  needsReply: function() {
    return this.getConversations()[0].needsReply();
  },

  getLastMsgDate: function() {
    return this.getConversations()[0].getLastMsgDate();
  },

  getConvoById: function(convoId) {
    return this.conversations[convoId];
  },

  markAllResolved: function() {
    for (let id in this.conversations) {
      this.conversations[id].markNeedsReply(false);
    }
  },

  hasDraft: function() {
    for (let id in this.conversations) {
      if (this.conversations[id].hasDraft()) {
        return true;
      }
    }
    return false;
  },

  hasUnread: function() {
    for (let id in this.conversations) {
      if (this.conversations[id].hasUnread()) {
        return true;
      }
    }
    return false;
  }
};


var LovebirdModule = function() {
  // module variables:
  let myPeople = {};
  // dictionary keyed on the email address of the person; will contain
  // identity object and message history for that person.

  let m_sortedPeople = [];
  // ordered array of email addresses used to display people tree

  let lbTabDocument = null;
  let m_lastSelectedPerson = null;
  let m_lastSortOrder = "unanswered";
  let uiDelayTimer = null;

  let m_myEmail = null; // See getter of the public interface object

  function clearList(listElem) {
    // Remove all <listitem>s (but not other children) from the
    // list. careful: children is live, removing nodes changes indices.
    var index = 0;
    var children = listElem.childNodes;
    while (index < children.length) {
      if (!children[index]) {
        break;
      }
      if (children[index].tagName == "listitem") {
        listElem.removeChild(children[index]);
      } else {
        index++;
      }
    }
  }

  function niceDateFormat(date) {
    var now = new Date();
    var months = ["January", "February", "March", "April", "May",
                  "June", "July", "August", "September", "October",
                  "November", "December"];
    var days = ["Sunday", "Monday", "Tuesday", "Wednesday",
                "Thursday", "Friday", "Saturday"];
    if (date.getFullYear() < now.getFullYear()) {
      return months[date.getMonth()] + ", " + date.getFullYear();
    }
    if (date.getMonth() < now.getMonth()) {
      return months[date.getMonth()] + " " + date.getDate();
    }
    if (date.getDate() < now.getDate()) {
      var dayOfMonth = date.getDate();
      var suffix;
      if (dayOfMonth == 1) dayOfMonth = "First";
      else if (dayOfMonth ==2) dayOfMonth = "Second";
      else if (dayOfMonth == 3) dayOfMonth = "Third";
      else if (dayOfMonth == 21 || dayOfMonth == 31) dayOfMonth = dayOfMonth + "st";
      else if (dayOfMonth == 22) dayOfMonth = dayOfMonth + "nd";
      else if (dayOfMonth == 23) dayOfMonth = dayOfMonth + "rd";
      else dayOfMonth = dayOfMonth + "th";
      return days[date.getDay()] + " the " + dayOfMonth;
    }
    var hours = date.getHours();
    var minutes = date.getMinutes();
    if (minutes < 10) {
      return hours + ":0" + minutes;
    }
    return hours + ":" + minutes;
  }

  function whoAmI(folder) {
    /* We need to provide an identity to define who is
     * replying. Determining the right identity can be fairly
     * complicated. We'll try several fallbacks for getting an
     * appropriate identity. This code is a simplification of the
     * getIdentity functions in mailCommands.js. See
     * http://mxr.mozilla.org/comm-central/source/mail/base/content/mailCommands.js */

    var server, identity;
    let server = folder.server;
      /* If there was a custom identity for the folder of the original
       * message, use that. */
    let identity = folder.customIdentity;
    if (!identity) {
      /* if there are multiple identities on the server, use the first
       * one */
      identity = MailServices.accounts.GetIdentitiesForServer(server)
        .QueryElementAt(0, Ci.nsIMsgIdentity);
      if (!identity) {
        // if that still doesn't work, use the default identity.
        identity = MailServices.accounts.defaultAccount.defaultIdentity;
      }
    }
    return identity;
    /* TODO a person may have more than one identity, in which case
     * this function will have to return multiples. Then we'll have
     * to give them a choice of which one to send from. */
  }

  function openReplyWindow(msgUri) {
    let msgDbHdr = getMsgHdr(msgUri);

    // Folder of the message we're replying to gives us clue
    // about identity that should be used to send:
    let identity = whoAmI(msgDbHdr.folder);
    
    let msgWindow = Cc["@mozilla.org/messenger/msgwindow;1"]
      .createInstance(Ci.nsIMsgWindow);
    MailServices.compose.OpenComposeWindow(null, msgDbHdr, msgUri,
                                           Ci.nsIMsgCompType.Reply,
                                           Ci.nsIMsgCompFormat.Default,
                                           identity, msgWindow);
  }

  function openNewMailToAddress(address) {
    var sURL="mailto:" + address;
    // make the URI
    let aURI = Services.io.newURI(sURL, null, null);
    // open new message
    MailServices.compose.OpenComposeWindowWithURI (null, aURI);
  }

  function openLovebirdTab() {
    let url = "chrome://lovebird/content/window.xul";

    let tabmail = Cc['@mozilla.org/appshell/window-mediator;1']
      .getService(Ci.nsIWindowMediator)
      .getMostRecentWindow("mail:3pane")
      .document.getElementById("tabmail");

    // Check if tab is already open before we open a new one...
    let alreadyOpen = false;
    for (var i = 0 ; i < tabmail.tabContainer.childNodes.length; i++) {
      var tab = tabmail.tabContainer.getItemAtIndex(i);
      // TODO this uses label, which is not ideal... I'd rather check
      // the URL of the XUL document in the tab, but I don't know how
      if (tab.label == "Lovely People") {
        alreadyOpen = true;
        tabmail.switchToTab(tab);
        break;
      }
    }
    if (!alreadyOpen) {
      tabmail.openTab("chromeTab", { chromePage: url });
    }

    // TODO Improve this page: https://developer.mozilla.org/en-US/docs/Extensions/Thunderbird/HowTos/Common_Thunderbird_Extension_Techniques/Add_New_Tab
  }

  var PeopleTreeView = {
    get rowCount() { return m_sortedPeople.length;},
    getCellText : function(row, column){
      if (row >= m_sortedPeople.length) { return "";}
      var email = m_sortedPeople[row];
      var person = myPeople[email];
      switch (column.id) {
      case "personStatusColumn":
        statusString = "";
        if (person.hasUnread()) {
          statusString += "N";
        }
        if (person.hasDraft()) {
          statusString += "D";
        }
        return statusString;
      case "personNameColumn":
        return person.getName();
      }
    },
    setTree: function(treebox){ this.treebox = treebox; },
    isContainer: function(row){ return false; },
    isSeparator: function(row){ return false; },
    isSorted: function(){ return false; },
    getLevel: function(row){ return 0; },
    getImageSrc: function(row,col){ return null; },
    getRowProperties: function(row,props){},
    getCellProperties: function(row,col,props){
      if (row >= m_sortedPeople.length) { return; }
      var email = m_sortedPeople[row];
      var person = myPeople[email];
      if (col.id == "personNameColumn") {
        addTreeProp(props, "large");
      }
      if (col.id == "personStatusColumn") {
        if (person.needsReply()) {
          addTreeProp(props, "needsReply");
        }
      }
    },
    getColumnProperties: function(colid,col,props){}
  };

  let MyQueryListener = function(personId) {
    this.personId = personId;
  }
  MyQueryListener.prototype = {
    onItemsAdded: function ql_onItemsAdded(aItems, aCollection) {
    },

    /* called when items that are already in our collection 
     * get re-indexed */
    onItemsModified: function ql_onItemsModified(aItems,
						 aCollection) {
    },

    /* called when items that are in our collection are purged 
     * from the system */
    onItemsRemoved: function ql_onItemsRemoved(aItems, 
					       aCollection) {
    },

    /* called when our database query completes */
    onQueryCompleted: function ql_onQueryCompleted(collection) {
      // TODO how do I explicitly sort this collection by date?
      // maybe not needed - that seems to be the default sort.
  
      // store the whole collection in myPeople:
      var email = this.personId.value;
      var peep = myPeople[email];

      // Feed all of these messages to the Peep object, which will
      // handle sorting them.
      peep.clearHistory();
      for (var i =0; i < collection.items.length; i++) {
        // false means this is a db-retrieved message, not a new one
        peep.addMessage(collection.items[i], false);
      }

      // Add person to sorted array used to populate people tree:
      m_sortedPeople.push(email);

      // Inform tree that a new row was just added so it will redraw
      var tree = lbTabDocument.getElementById("lb-ppl-tree");
      tree.treeBoxObject.rowCountChanged(m_sortedPeople.length -1, 1);
    }
  };

  function loadDataForPerson(identity) {
    let email = identity.value;
    if (!myPeople[email]) {
      myPeople[email] = new Peep(identity);
    }
    
    // Query for all messages to/from this person
    let query = Gloda.newQuery(Gloda.NOUN_MESSAGE);
    
    query.involves(identity);
    let listener = new MyQueryListener(identity);
    // The query listener object will handle filling in the list
    // rows as data is recieved.
    let clcn = query.getCollection(listener);
  }

  function luvPerson(identity) {
    let email = identity.value;
    // don't do anything if this one is already in myPeople:
    if (!myPeople[email]) {
      LovebirdNameStore.rememberPeep(email);
      loadDataForPerson(identity);
    } else {
      dump("It's a duplicate.\n");
    }
  }

  function unLuvPerson(email) {
    let pplTree = lbTabDocument.getElementById("lb-ppl-tree");
    LovebirdNameStore.forgetPeep(email);
    delete myPeople[email];
    sortPeopleBy(m_lastSortOrder); // just to ensure unluved
    // person is removed from m_sortedPeople

    // force selection to first (remaining) row of people tree
    // so we're looking at something valid and not zombie convos
    pplTree.treeBoxObject.invalidate();
    pplTree.view.selection.select(0);

  }

  function luvPersonByEmail(email) {
    // Query Gloda to get the identity object for this email
    // address!
    var id_q = Gloda.newQuery(Gloda.NOUN_IDENTITY);
    id_q.kind("email");
    id_q.value(email);
    var id_coll = id_q.getCollection({
      onItemsAdded: function(aItems, aCollection) {},
      onItemsModified: function (aItems,aCollection) {},
      onItemsRemoved: function(aItems, aCollection) {},
      onQueryCompleted: function _onCompleted(id_coll) {
        if (id_coll.items.length > 0) {
          luvPerson(id_coll.items[0]);
        } else {
          window.alert("No identity data found for " + email);
        }
      }
    });	
  }

  function luvSenderOfMessage(selectedMsg) {
    // selectedMsg must be a a nsIMsgDBHdr
    Gloda.getMessageCollectionForHeader(selectedMsg,
     {
       onItemsAdded: function(aItems, aCollection) {},
       onItemsModified: function(aItems, aCollection) {},
       onItemsRemoved: function(aItems, aCollection) {},
       onQueryCompleted: function _onCompleted(id_coll) {
         luvPerson(id_coll.items[0].from);
       }
     });
  }

  function updateUIForPerson(emailAddr, newMsgCollection) {
    dump("Will update UI for " + emailAddr + " with "
         + newMsgCollection.items.length
         + " new messages.\n");
    if (!lbTabDocument) {
      dump("no tab document. returning.\n");
      return;
    }
    let person = myPeople[emailAddr];
    if (!person) {
      dump("I don't know this person. Returning.\n");
      return;
    }

    // prepend new messages onto this person's history!
    for (var i =0; i < newMsgCollection.items.length; i++) {
      // true indicates this is a new message, not seen before
      person.addMessage(newMsgCollection.items[i], true);
    }

    // Person's status may have changed, so find their row in
    // the people tree and update it:
    dump("Trying to update person list entry.\n");
    let rowIndex = m_sortedPeople.indexOf(emailAddr);
    if (rowIndex > -1) {
      let tree = lbTabDocument.getElementById("lb-ppl-tree");
      tree.treeBoxObject.invalidateRow(rowIndex);
    }

    // TODO maybe re-sort the people list, if change in status of this
    // person would affect where in the list they should appear.

    if (emailAddr === m_lastSelectedPerson) {
      // If person is the last one clicked on (so their msg history is
      // displayed) then recreate that too since it probably has a new
      // msg on top.
      dump("Updated selected person, so relisting email.\n");
      showEmailForPerson(emailAddr);
      // TODO this will recrete the whole message tree view object.
      // Maybe better to just invalidate the tree? But what if the
      // number of rows changed?
    }
  }

  function cleanEmailAddr(string) {
    // code in overlay.js toolbarAddButton duplicates this
    // TODO drop leading or trailing spaces
    let re = /<(.+)>/;
    if (re.test(string)) {
      return re.exec(string)[1];
    }
    return string;
  }

  function startNewMailListener() {
    // from https://developer.mozilla.org/en-US/docs/Extensions/Thunderbird/HowTos/Common_Thunderbird_Use_Cases/Open_Folder#Watch_for_New_Mail

    var newMailListener = {
      msgAdded: function(aMsgHdr) {
        // This detects new mail sent as well as received.
        // Here's all the stuff we can read straight off a nsIMsgDBHdr
        // https://developer.mozilla.org/en-US/docs/XPCOM_Interface_Reference/nsIMsgDBHdr

        // Find all the people involved in the message
        let peopleInvolved = [];
        peopleInvolved.push( cleanEmailAddr( aMsgHdr.author ));
        let recipients = aMsgHdr.recipients.split(",");
        for (var i = 0; i < recipients.length; i++) {
          let anotherAddr = cleanEmailAddr( recipients[i] );
          dump("Adding: " + anotherAddr + "\n");
          peopleInvolved.push( anotherAddr);
        }
        dump("People involved in this email: " + peopleInvolved + "\n");

        // Wait a second before querying the database. Otherwise, the
        // brand-new message won't appear in our query results.
        dump("Setting timer.\n");
        uiDelayTimer = Cc["@mozilla.org/timer;1"]
            .createInstance(Ci.nsITimer);
        uiDelayTimer.initWithCallback({
          notify: function() {
            dump("Timer resolves. Querying Gloda:\n");
            // query the database for the collection corresponding to
            // this message header:
            Gloda.getMessageCollectionForHeader(aMsgHdr, {
              onItemsAdded: function(aItems, aCollection) {},
              onItemsModified: function(aItems, aCollection) {},
              onItemsRemoved: function(aItems, aCollection) {},
              onQueryCompleted: function _onCompleted(id_coll) {
                dump("Gloda query completed.\n");
                // Update the UI for any of those people that I luv
                for (i = 0; i < peopleInvolved.length; i++) {
                  if (myPeople[peopleInvolved[i]] != undefined) {
                    updateUIForPerson(peopleInvolved[i], id_coll);
                  }
                }
              }
            });
          }
        }, 1500, Ci.nsITimer.TYPE_ONE_SHOT);
      }
    };
    // Add our listener:
    var notfnSvc =
      Cc["@mozilla.org/messenger/msgnotificationservice;1"]
      .getService(Ci.nsIMsgFolderNotificationService);

    notfnSvc.addListener(newMailListener, notfnSvc.msgAdded);
  }

  function loadEverybody(document) {
    // Save a reference to the lovebird XUL doc
    lbTabDocument = document;

    /*See:  https://developer.mozilla.org/en-US/docs/Thunderbird/Creating_a_Gloda_message_query and
      https://developer.mozilla.org/en-US/docs/Thunderbird/Gloda_examples
    */

    // Set up tree view for people list:
    var pplTree = lbTabDocument.getElementById("lb-ppl-tree");
    pplTree.view = PeopleTreeView;

    // Read list of lovely peeps from sqlite:
    LovebirdNameStore.getPeeps(function(peeps) {
      // Query for an identity for each:
      var id_q = Gloda.newQuery(Gloda.NOUN_IDENTITY);
      id_q.kind("email");
      
      /* use "apply" to make each name in myPeeps array an
       * argument to id_q.value(). That will result in the
       * query doing an OR across all of them. */
      id_q.value.apply(id_q, peeps);
      let id_coll=id_q.getCollection({
	onItemsAdded: function(aItems, aCollection) {},
	onItemsModified: function (aItems,aCollection) {},
	onItemsRemoved: function(aItems, aCollection) {},
	onQueryCompleted: function _onCompleted(id_coll) {
          // Get identity corresponding to each email
          // address in our peep store; load data for
          // each one.
          for (var i = 0; i < id_coll.items.length; i++) {
            loadDataForPerson(id_coll.items[i]);
	  }
	} // end onQueryCompleted
      }); // end getCollection
    }); // end getPeeps
  }

  // New one using tree:
  function showEmailForPerson(email) {
    m_lastSelectedPerson = email;
    var msgTree = lbTabDocument.getElementById("lb-msg-tree");
    var person = myPeople[email];
    var conversations = person.getConversations();
    var treeView = {
      get rowCount() {return conversations.length;},
      getCellText : function(row, column){
        var convo = conversations[row];
        switch (column.id) {
        case "inOutColumn":
          let label = "";
          if (convo.hasDraft()) {
            label += "D";
          }
          return label;
        case "subjectColumn":
          return convo.getSubject();
        case "needsReplyColumn":
          return "";
        case "dateColumn":
          return niceDateFormat(convo.getLastMsgDate());
        }
      },
      setTree: function(treebox){ this.treebox = treebox; },
      isContainer: function(row){ return false; },
      isSeparator: function(row){ return false; },
      isSorted: function(){ return false; },
      getLevel: function(row){ return 0; },
      getImageSrc: function(row,col){ return null; },
      getRowProperties: function(row,props){},
      getCellProperties: function(row,col,props){
        var convo = conversations[row];        
        // row is integer, but col is an object...
        if (col.id == "needsReplyColumn") {
          /* Set a property to make the cell starred or unstarred -
           * there are css selectors in lovebird.css that set the
           * star image based on this property. */
          addTreeProp(props, convo.needsReply()?"needsReply": "doesntNeed");
        } if (col.id == "inOutColumn") {
          addTreeProp(props, (convo.getStatus() == "sent") ?"outgoing": "incoming");
        } else {
          if (convo.hasUnread()) {
            addTreeProp(props, "unread");
          }
        }
      },
      getColumnProperties: function(colid,col,props){}
    };

    // Other useful properties of msg:
    // tags, starred, read
    msgTree.view = treeView;
  }

  function sortPeopleBy(sortOrder) {
    /* Sort function returning positive means put
     * the 2nd argument first, returning negative means put
     * the 1st argument first. */ 
    var sortFunction = null;
    m_lastSortOrder = sortOrder;
    switch(sortOrder) {
    case "oldest":
      sortFunction = function(a, b) {
        return a.getLastMsgDate() - b.getLastMsgDate();
      }
      break;
    case "unanswered":
      // sort ones where the last message is TO me on top,
      // where last message is FROM me on the bottom.
      sortFunction = function(a, b) {
        if (a.getStatus() == "sent" && 
            b.getStatus() == "unanswered") {
          return 1;
        } else if (a.getStatus() == "unanswered" &&
                   b.getStatus() == "sent") {
          return -1;
        } else {
          return a.getLastMsgDate() - b.getLastMsgDate();
        }
      }
      break;
    case "alphabetical":
      sortFunction = function(a, b) {
        if (a.getName() > b.getName()) {
          return 1;
        } else if (b.getName() > a.getName()) {
          return -1;
        } else {
          return 0;
        }
      }
      break;
    }

    // make array to sort out of myPeople (person, lastMsg) tuples
    var arrayToSort = [];
    for (var email in myPeople) {
      arrayToSort.push(myPeople[email]);
    }

    // sort it according to sort function
    arrayToSort.sort(sortFunction);
    
    // refill tree with newly ordered email addresses
    m_sortedPeople = [];
    for (var i = 0; i < arrayToSort.length; i++) {
      //addRowToPplList(arrayToSort[i]);
      m_sortedPeople.push(arrayToSort[i].getEmailAddr());
    }

    // Invalidate the tree to cause it to be redrawn
    var tree = lbTabDocument.getElementById("lb-ppl-tree");
    tree.treeBoxObject.invalidate();
  }

  function getConvoForRow(index) {
    if (m_lastSelectedPerson) {
      var person = myPeople[m_lastSelectedPerson];
      if (person) {
        var convos = person.getConversations();
        if (index >= 0 && index < convos.length) {
          return convos[index];
        }
      }
    }
    return null;
  }

  function getHtmlForThread(rowIndex) {
    var convo = getConvoForRow(rowIndex);
    if (convo) {
      return convo.getThreadTextAsHtml();
    } else {
      return "Error - no such conversation.";
    }
  }

  function openReplyWindowForThread(rowIndex) {
    // TODO: If this conversation has a draft, we should open the
    // draft instead of starting a new message.
    var convo = getConvoForRow(rowIndex);
    if (convo) {
      openReplyWindow( convo.getLastMsgUri() );
    }
  }

  function handleStarClick(rowIndex) {
    var convo = getConvoForRow(rowIndex);
    if (convo) {
      convo.toggleNeedsReply();
    }
  }

  return {
    openLovebirdTab: openLovebirdTab,
    loadEverybody: loadEverybody,
    luvPerson: luvPerson,
    luvPersonByEmail: luvPersonByEmail,
    luvSenderOfMessage: luvSenderOfMessage,
    sortPeopleBy: sortPeopleBy,
    openReplyWindowForThread: openReplyWindowForThread,
    startNewMailListener: startNewMailListener,
    getHtmlForThread: getHtmlForThread,
    handleStarClick: handleStarClick,
    showEmailForPersonIndex: function(rowIndex) {
      if (rowIndex >= 0 && rowIndex < m_sortedPeople.length) {
        showEmailForPerson(m_sortedPeople[rowIndex]);
      }
    },
    openNewEmailToPersonIndex: function(rowIndex) {
      if (rowIndex >= 0 && rowIndex < m_sortedPeople.length) {
        openNewMailToAddress(m_sortedPeople[rowIndex]);
      }
    },
    
    get myEmail() {
      if (!m_myEmail) {
        m_myEmail = MailServices.accounts.defaultAccount.defaultIdentity.email;
      }
      return m_myEmail;
    },

    markAllResolved: function(rowIndex) {
      if (rowIndex >= 0 && rowIndex < m_sortedPeople.length) {
        var email = m_sortedPeople[rowIndex];
        myPeople[email].markAllResolved();
      }
    },

    unLuvPersonIndex: function(rowIndex) {
      if (rowIndex >= 0 && rowIndex < m_sortedPeople.length) {
        unLuvPerson(m_sortedPeople[rowIndex]);
      }
    }
  };
}();