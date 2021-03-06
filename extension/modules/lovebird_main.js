/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

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
    return "Today at " + hours + ":0" + minutes;
  }
  return "Today at " + hours + ":" + minutes;
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
   
    if (!msgColl.read) {
      // Don't care about unread messages from myself:
      if (msgColl.from.value != LovebirdModule.myEmail) {
        this._hasUnread = true;
      }
    }
  },
  
  getMessageDetails: function() {
    let nuggets = [];
    for (var i = 0; i < this.msgColls.length; i++) {
      let coll = this.msgColls[i];
      let uri = this.msgColls[i].folderMessageURI;
      nuggets.push({subject: coll.subject,
                    date: niceDateFormat( coll.date ),
                    from: coll.from.value,
                    body: getMessageBody(uri),
                    name: coll.from.contact.name,
                    isDraft: (coll.folder.name == "Drafts")
                   });
    }
    return nuggets;
  },

  markRead: function(newVal) {
    // See https://developer.mozilla.org/en-US/docs/XPCOM_Interface_Reference/nsIMsgDatabase#MarkRead%28%29
    /* And
    * https://developer.mozilla.org/en-US/docs/XPCOM_Interface_Reference/nsIMsgDBHdr#markRead.28.29
    * "It is also mandatory to set msgHdr.folder.msgDatabase = null
    * after performing this kind of operations to prevent leaking."
    */
    if (newVal == true) {
      this._hasUnread = false;
      // Mark all unread messages in this thread read
      for (var i = 0; i < this.msgColls.length; i++) {
        let msgColl = this.msgColls[i];
        if (!msgColl.read) {
          var uri = msgColl.folderMessageURI;
          let hdr = getMsgHdr(uri);
          hdr.folder.msgDatabase.MarkHdrRead(hdr, true, null);
          hdr.folder.msgDatabase = null;
        }
      }
    } else {
      this._hasUnread = true;
      // Mark latest not-from-me message in this thread unread
      for (var i = 0; i < this.msgColls.length; i++) {
        let msgColl = this.msgColls[i];
        if (msgColl.read) {
          if (msgColl.from.value != LovebirdModule.myEmail) {
            var uri = msgColl.folderMessageURI;
            let hdr = getMsgHdr(uri);
            hdr.folder.msgDatabase.MarkHdrRead(hdr, false, null);
            hdr.folder.msgDatabase = null;
            break;
          }
        }
      }
    }
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

  toggleUnread: function() {
    if (this._hasUnread) {
      this.markRead(true);
    } else {
      this.markRead(false);
    }
  },

  needsReply: function() {
    return this._needsReplyFlag;
  },

  lastMsgIsFromMe: function() {
    // TODO in the future maybe myEmail can have more than
    // one email - it's sent if it's from any of them.
    return (this.msgColls[0].from.value == LovebirdModule.myEmail);
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
  },

  openInNewTab: function() {
// gConversationOpener.openConversationForMessages(gFolderDisplay.selectedMessages);
    let tabmail = Cc['@mozilla.org/appshell/window-mediator;1']
      .getService(Ci.nsIWindowMediator)
      .getMostRecentWindow("mail:3pane")
      .document.getElementById("tabmail");
    let aMessage = this.msgColls[0];
    // From http://mxr.mozilla.org/comm-central/source/mail/base/content/msgHdrViewOverlay.js  line 2813
    tabmail.openTab("glodaList", {
      conversation: aMessage.conversation,
      message: aMessage,
      title: aMessage.conversation.subject,
      background: false
    });
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

  getNeedsReplyDate: function() {
    // Returns date of *newest* conversation with this person that
    // is expecting a reply.
    let convos = this.getConversations();
    for (let i = 0; i < convos.length; i++) {
      if (convos[i].needsReply()) {
        return convos[i].getLastMsgDate();
      }
    }
    return null;
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

  markAllRead: function() {
    for (let id in this.conversations) {
      this.conversations[id].markRead(true);
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
  },

  topConcern: function() {
    // returns "draft", "needsReply", or null
    // if there's both a conversation with a draft and a conversation
    // that needs a reply, use whichever one is newest.
    let convos = this.getConversations();
    for (let i = 0; i < convos.length; i++) {
      if (convos[i].hasDraft()) {
        return "draft";
      }
      if (convos[i].needsReply()) {
        return "needsReply";
      }
    }
    return null;
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

  let m_startedLoad = false;
  let m_finishedLoad = false;

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
    
    let composeType = Ci.nsIMsgCompType.Reply;
    // If this is a draft, resume writing the draft; otherwise
    // compose new reply.
    if (msgDbHdr.folder.name == "Drafts") {
      composeType = Ci.nsIMsgCompType.Draft;
    } else {
      composeType = Ci.nsIMsgCompType.Reply;
    }
    MailServices.compose.OpenComposeWindow(null, msgDbHdr, msgUri,
                                           composeType,
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

  var PeopleTreeView = {
    get rowCount() { return m_sortedPeople.length;},
    getCellText : function(row, column){
      if (row >= m_sortedPeople.length) { return "";}
      var email = m_sortedPeople[row];
      var person = myPeople[email];
      switch (column.id) {
      case "personStatusColumn":
        return "";
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
    getRowProperties: function(row, props){},
    getCellProperties: function(row,col,props){
      if (row >= m_sortedPeople.length) { return; }
      var email = m_sortedPeople[row];
      var person = myPeople[email];
      if (col.id == "personNameColumn") {
        addTreeProp(props, "large");
        if (person.hasUnread()) {
          addTreeProp(props, "unread");
        }
      }
      if (col.id == "personStatusColumn") {
        // Either draft icon or needs reply icon, whichever takes
        // precedence
        let concern = person.topConcern();
        if (concern == "draft") {
          addTreeProp(props, "draft");
        } else if (concern == "needsReply") {
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
        peopleInvolved.push( anotherAddr);
      }
      
      // Wait a second before querying the database. Otherwise, the
      // brand-new message won't appear in our query results.
      uiDelayTimer = Cc["@mozilla.org/timer;1"]
        .createInstance(Ci.nsITimer);
      uiDelayTimer.initWithCallback({
        notify: function() {
          // query the database for the collection corresponding to
          // this message header:
          Gloda.getMessageCollectionForHeader(aMsgHdr, {
            onItemsAdded: function(aItems, aCollection) {},
            onItemsModified: function(aItems, aCollection) {},
            onItemsRemoved: function(aItems, aCollection) {},
            onQueryCompleted: function _onCompleted(id_coll) {
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

  function luvPerson(identity) {
    let email = identity.value;
    // don't do anything if this one is already in myPeople:
    if (!myPeople[email]) {
      LovebirdNameStore.rememberPeep(email);
      myPeople[email] = new Peep(identity);

      // If lb tab is open, load messages for newly luved person:
      if (lbTabDocument) {
        loadConversationsForPerson(myPeople[email]);
      }
    }
    // TODO: Maybe tell user if the person is already in the list?
  }

  function unLuvPerson(email) {
    LovebirdNameStore.forgetPeep(email);
    delete myPeople[email];

    if (lbTabDocument) {
      let pplTree = lbTabDocument.getElementById("lb-ppl-tree");

      sortPeopleBy(m_lastSortOrder); // just to ensure unluved
      // person is removed from m_sortedPeople

      // force selection to first (remaining) row of people tree
      // so we're looking at something valid and not zombie convos
      pplTree.treeBoxObject.invalidate();
      pplTree.view.selection.select(0);
    }
  }

  function luvPersonByEmail(email) {
    // Query Gloda to get the identity object for this email
    // address!
    let errorLabel= null;
    if (lbTabDocument) {
      errorLabel = lbTabDocument.getElementById("lb-add-person-error");
    }

    let id_q = Gloda.newQuery(Gloda.NOUN_IDENTITY);
    id_q.kind("email");
    id_q.value(email);
    var id_coll = id_q.getCollection({
      onItemsAdded: function(aItems, aCollection) {},
      onItemsModified: function (aItems,aCollection) {},
      onItemsRemoved: function(aItems, aCollection) {},
      onQueryCompleted: function _onCompleted(id_coll) {
        if (id_coll.items.length > 0) {
          // Found the person! Add them
          luvPerson(id_coll.items[0]);
          if (errorLabel) {
            // clear error label
            errorLabel.setAttribute("value", "");
          }
        } else {
          // show error message in label:
          if (errorLabel) {
            errorLabel.setAttribute("value",
              "No person matching '" + email + "' found");
          }
        }
      }
    });	
  }

  function luvSenderOfMessage(selectedMsg) {
    luvPersonByEmail( cleanEmailAddr( selectedMsg.author ));
  }
  
  function senderIsLoved(selectedMsg, callback) {
    let sender = cleanEmailAddr( selectedMsg.author );
    return !!myPeople[sender];
  }

  function updateUIForPerson(emailAddr, newMsgCollection) {
    if (!lbTabDocument) {
      return;
    }
    let person = myPeople[emailAddr];
    if (!person) {
      return;
    }

    // prepend new messages onto this person's history!
    for (var i =0; i < newMsgCollection.items.length; i++) {
      // true indicates this is a new message, not seen before
      person.addMessage(newMsgCollection.items[i], true);
    }

    // Person's status may have changed, so find their row in
    // the people tree and update it:
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
      showEmailForPerson(emailAddr);
      // TODO this will recrete the whole message tree view object.
      // Maybe better to just invalidate the tree? But what if the
      // number of rows changed?
    }
  }

  function cleanEmailAddr(string) {
    /* Note: the field might autocomplete to something like:
     * Atul Varma <atul@mozillafoundation.org>
     * in which case we want to strip out what's inside <> */
    // TODO drop leading or trailing spaces
    let re = /<(.+)>/;
    if (re.test(string)) {
      return re.exec(string)[1];
    }
    return string;
  }

  function startNewMailListener() {
    // from https://developer.mozilla.org/en-US/docs/Extensions/Thunderbird/HowTos/Common_Thunderbird_Use_Cases/Open_Folder#Watch_for_New_Mail
    // Add our listener:
    var notfnSvc =
      Cc["@mozilla.org/messenger/msgnotificationservice;1"]
      .getService(Ci.nsIMsgFolderNotificationService);

    notfnSvc.addListener(newMailListener, notfnSvc.msgAdded);
  }

  function loadPeople() {
    if (m_startedLoad) {
      // idempotent
      return; 
    }
    m_startedLoad = true;
    /*See:  https://developer.mozilla.org/en-US/docs/Thunderbird/Creating_a_Gloda_message_query and
      https://developer.mozilla.org/en-US/docs/Thunderbird/Gloda_examples
    */
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
            let identity = id_coll.items[i];
            let email = identity.value;
            if (!myPeople[email]) {
              myPeople[email] = new Peep(identity);
            }
          }
          if (lbTabDocument) {
            loadConversations();
          }
          m_finishedLoad = true;
	} // end onQueryCompleted
      }); // end getCollection
    }); // end getPeeps
  }

  function loadConversationsForPerson(peep) {
    // Query for all messages to/from this person
    let identity = peep.identity;
    let query = Gloda.newQuery(Gloda.NOUN_MESSAGE);
    
    query.involves(identity);
    let listener = new MyQueryListener(identity);
    // The query listener object will handle filling in the list
    // rows as data is recieved.
    let clcn = query.getCollection(listener);
  }

  function loadConversations() {
    // Set up tree view for people list:
    var pplTree = lbTabDocument.getElementById("lb-ppl-tree");
    pplTree.view = PeopleTreeView;
    
    for (let email in myPeople) {
      loadConversationsForPerson(myPeople[email]);
    }
  }

  function loadTab(document) {
    // load people if they haven't been loaded already
    lbTabDocument = document;
    if (m_finishedLoad) {
      // load people has already been called
      loadConversations();
    } else {
      loadPeople();
      // will call loadConversations when it's done
    }
  }

  function shutItDown() {
    m_sortedPeople = [];
    /* myPeople stays in memory after tab is closed so that
     * heart buttons will keep working.
     * TODO anything further we need to do to avoid
     * memory leaks here? */
    lbTabDocument = null;
    m_lastSelectedPerson = null;

    // Unregister listener:
    var notfnSvc =
      Cc["@mozilla.org/messenger/msgnotificationservice;1"]
      .getService(Ci.nsIMsgFolderNotificationService);
    notfnSvc.removeListener(newMailListener);
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
          return "";
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
          if (convo.hasDraft()) {
            addTreeProp(props, "draft");
          } else if (convo.lastMsgIsFromMe()) {
            addTreeProp(props, "outgoing");
          } else {
            addTreeProp(props, "incoming");
          }
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
      };
      break;
    case "unanswered":
      // sort ones where a message needs reply on top
      sortFunction = function(a, b) {
        let aNeedsReply = a.getNeedsReplyDate();
        let bNeedsReply = b.getNeedsReplyDate();
        if ((aNeedsReply == null) && (bNeedsReply != null)) {
          return 1;
        } else if ((aNeedsReply != null) && (bNeedsReply == null)) {
          return -1;
        } else if ((aNeedsReply != null) && (bNeedsReply != null)) {
          return aNeedsReply - bNeedsReply;          
        } else {
          return a.getLastMsgDate() - b.getLastMsgDate();
        }
      };
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
      };
      break;
    case "unread":
      // Sort people who have unread messages on top
      sortFunction = function(a, b) {
        if (!a.hasUnread()&& b.hasUnread()) {
          return 1;
        } else if (a.hasUnread() && !b.hasUnread()) {
          return -1;
        } else {
          return a.getLastMsgDate() - b.getLastMsgDate();
        }
      };
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

  function getThreadContents(rowIndex) {
    var convo = getConvoForRow(rowIndex);
    if (convo) {
      return convo.getMessageDetails();
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
    loadPeople: loadPeople,
    loadTab: loadTab,
    luvPerson: luvPerson,
    luvPersonByEmail: luvPersonByEmail,
    luvSenderOfMessage: luvSenderOfMessage,
    senderIsLoved: senderIsLoved,
    sortPeopleBy: sortPeopleBy,
    openReplyWindowForThread: openReplyWindowForThread,
    startNewMailListener: startNewMailListener,
    getThreadContents: getThreadContents,
    handleStarClick: handleStarClick,
    getConvoForRow: getConvoForRow,
    shutItDown: shutItDown,
    cleanEmailAddr: cleanEmailAddr,
    unLuvPerson: unLuvPerson,
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
    },

    markAllRead: function(rowIndex) {
      if (rowIndex >= 0 && rowIndex < m_sortedPeople.length) {
        var email = m_sortedPeople[rowIndex];
        myPeople[email].markAllRead();
      }
    },

    toggleOneRead: function(rowIndex) {
      var convo = getConvoForRow(rowIndex);
      if (convo) {
        convo.toggleUnread();
      }
    },

    openThreadNewTab: function(rowIndex) {
      var convo = getConvoForRow(rowIndex);
      if (convo) {
        convo.openInNewTab();
      }
    }
  };
}();