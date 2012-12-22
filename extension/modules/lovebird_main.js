EXPORTED_SYMBOLS = ["LovebirdModule"];

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;

Cu.import("resource://lovebird/modules/name_store.js");
Cu.import("resource:///modules/gloda/public.js");
Cu.import("resource:///modules/mailServices.js"); // needed for MailServices.compose etc.
Cu.import("resource://gre/modules/Services.jsm"); // needed for Services.io etc.

const myEmail = "jono@fastmail.fm";

function Convo(convoId) {
  this.id = convoId;
  this.lastMsgDate = null;
  this.needsReplyFlag = false; // TODO read from DB
  this.hasUnread = false;
  this.lastSenderIsMe = false;
  this.pendingDraft = false;

  this.msgColls = [];
}
Convo.prototype = {
  addMsg: function(msgColl) {
    // assert msgColl.conversationID === this.id ?
    this.msgColls.push(msgColl);
    if (msgColl.date > this.lastMsgDate) {
      // newest message...
      // set lastSenderIsMe to whether or not I sent this one
      // if it's a draft, set this.pendingDraft TODO How to know if it's draft?
      // if it's incoming and unread, set needsReplyFlag to true?
    }

    if (!msgColl.read) {
      this.hasUnread = true;
    }
  },
  
  getThread: function() {
    // return this.msgColls sorted by date
  },

  markRead: function(newVal) {
    this.hasUnread = newVal;
    // also mark the unread message itself read?
  },
  
  markNeedsReply: function(newVal) {
    this.needsReplyFlag = newVal;
    // TODO persist
  }
};

function Peep(identity) {
  this.identity = identity;
  this.history = [];
  //this.conversations = {}; // will be keyed by conversationId

      /*from: latestMsg.from.value,
      to: latestMsg.to[0].value,  	    // "to" is a list.
      subject: latestMsg.subject,
      date: latestMsg.date,
      uri: latestMsg.folderMessageURI,
      name: personId.contact.name*/
}
Peep.prototype = {
  addMessage: function(msgColl) {
    this.history.unshift(msgColl);
  },

  clearHistory: function() {
    this.history = [];
  },

  getHistory: function() {
    return this.history;
  },

  getName: function() {
    return this.identity.contact.name;
  },

  getEmailAddr: function() {
    return this.identity.value;
  },

  getStatus: function() {
    // return values match css class names for rows
    if (this.history[0].from.value == myEmail) {
      return "sent";
    } else {
      return "unanswered";
    }
  },

  getLastMsgDate: function() {
    return this.history[0].date;
  }
};



var LovebirdModule = function() {
  let myPeople = {};
  // dictionary keyed on the email address of the person; will contain
  // identity object and message history for that person.

  let lbTabDocument = null;
  let lastSelectedPerson = null;
  let uiDelayTimer = null;

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
    var months = ["", "January", "February", "March", "April", "May",
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
    return date.getHours() + ": " + date.getMinutes();
  }

  function openReplyWindow(msgUri) {
    // make the URI object
    let msgURI = Services.io.newURI(msgUri, null, null);
    let messenger = Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);
    // Get the message database header for the given message uri:
    let msgDbHdr = messenger.msgHdrFromURI(msgUri);
    
    /* We need to provide an identity to define who is
     * replying. Determining the right identity can be fairly
     * complicated. We'll try several fallbacks for getting an
     * appropriate identity. This code is a simplification of the
     * getIdentity functions in mailCommands.js. See
     * http://mxr.mozilla.org/comm-central/source/mail/base/content/mailCommands.js */
    let folder = msgDbHdr.folder;
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

  function getMessageBody(msgUri) {

    let msgURI = Services.io.newURI(msgUri, null, null);
    let messenger = Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);
    // Get the message database header for the given message uri:
    let aMessageHeader = messenger.msgHdrFromURI(msgUri);

    let listener = Cc["@mozilla.org/network/sync-stream-listener;1"]
      .createInstance(Ci.nsISyncStreamListener);

    // does this give us back the original msgUri and if so can we
    // skip this step?
    let uri = aMessageHeader.folder.getUriForMsg(aMessageHeader);
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
  
  function addRowToPplList(person) {
    if (!lbTabDocument) {
      return;
    }
    
    //let theList = document.getElementById("lb-main-list");
    let row = lbTabDocument.createElement('listitem');
    let cell = lbTabDocument.createElement('listcell');

    cell.setAttribute("label", person.getName());
    row.setAttribute("class", person.getStatus());
    row.appendChild(cell);
    /* stash the email address in an attribute of the row
     * so when user clicks on it we can retrieve it from the
     * click event's target. */
    row.setAttribute("lb_person_email", person.getEmailAddr());
 
    let personList = lbTabDocument.getElementById("lb-ppl-list");
    personList.appendChild(row);
  }

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
  
      dump("MyQueryListener got queryCompleted.\n");
      // store the whole collection in myPeople:
      var email = this.personId.value;
      var peep = myPeople[email];

      // put it in reverse-chronological, newest first:
      peep.clearHistory();
      for (var i =0; i < collection.items.length; i++) {
        peep.addMessage(collection.items[i]);
      }

      // add this new record to lovebird XUL list
      addRowToPplList(peep);
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
    dump("loadDataForPerson ( " + email + " ) is happening.\n");
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
      person.addMessage(newMsgCollection.items[i]);
    }

    // find this person's row in the people list so it can be updated
    dump("Trying to update person list entry.\n");
    let personList = lbTabDocument.getElementById("lb-ppl-list");
    let children = personList.childNodes;
    for (var i = 0; i < children.length; i++) {
      let row = children[i];
      if (row.getAttribute("lb_person_email") == emailAddr) {
        dump("Found it. Updating.\n");
        row.setAttribute("class", person.getStatus());
        break;
      }
    }

    // TODO maybe re-sort the people list, if change in status of this
    // person would affect where in the list they should appear.

    if (emailAddr === lastSelectedPerson) {
      // If person is the last one clicked on (so their msg history is
      // displayed) then recreate that too since it probably has a new
      // msg on top.
      dump("Updated selected person, so relisting email.\n");
      // TODO this part seems to not be happening, test.
      showEmailForPerson(emailAddr);
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
    lbTabDocument = document;
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
            loadDataForPerson(id_coll.items[i]);
	  }
	} // end onQueryCompleted
      }); // end getCollection
    }); // end getPeeps
  }

  function showEmailForPerson(email) {
    var lastSelectedPerson = email;
    var msgList = lbTabDocument.getElementById("lb-msg-list");
    clearList(msgList);
    
    var person = myPeople[email];
    var collection = person.getHistory();

    // Sort starred on top:
    // (TODO group each conversation under one header, put starred convos
    // on top, chronological within convo)
    collection.sort(function(a, b){
    /* Sort function returning positive means put
     * the 2nd argument first, returning negative means put
     * the 1st argument first. */ 
      if (a.starred && !b.starred) {
        return -1;
      }
      if (b.starred && !a.starred) {
        return 1;
      }
      return b.date - a.date;
    });
    
    for (var i = 0; i < collection.length; i++) {
      dump("conversationID: " + collection[i].conversationID + "\n");
      var msg = collection[i];
      let row = lbTabDocument.createElement('listitem');
      let cell = lbTabDocument.createElement('listcell');
      
      cell = lbTabDocument.createElement('listcell');
      cell.setAttribute('label', msg.subject);
      if (!msg.read) {
        cell.setAttribute("class", "unread");
        // TODO unset this class when you read it...
      }
      row.appendChild(cell);

      cell = lbTabDocument.createElement('listcell');
      cell.setAttribute('label', "");
      if (msg.starred) {
        var img = lbTabDocument.createElement('image');
        img.setAttribute("class", "lb-important");
        cell.appendChild(img);
      }
      row.appendChild(cell);
      
      cell = lbTabDocument.createElement('listcell');
      cell.setAttribute('label', niceDateFormat(msg.date));
      if (!msg.read) {
        cell.setAttribute("class", "unread");
      }
      row.appendChild(cell);

      // Other useful properties of msg:
      // tags, starred, read
      
      // store message uri in attribute so double-click handler
      // can get uri out of click event target
      row.setAttribute("lb_msg_uri", msg.folderMessageURI);
      
      msgList.appendChild(row);
    }
  }

  function sortPeopleBy(sortOrder) {
    /* Sort function returning positive means put
     * the 2nd argument first, returning negative means put
     * the 1st argument first. */ 
    var sortFunction = null;
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
    
    let theList = lbTabDocument.getElementById("lb-ppl-list");
    clearList(theList);

    // make array to sort out of myPeople (person, lastMsg) tuples
    var arrayToSort = [];
    for (var email in myPeople) {
      arrayToSort.push(myPeople[email]);
    }

    // sort it according to sort function
    arrayToSort.sort(sortFunction);
    
    // refill list with newly ordered records
    for (var i = 0; i < arrayToSort.length; i++) {
      addRowToPplList(arrayToSort[i]);
    }
  }

  return {
    openLovebirdTab: openLovebirdTab,
    loadEverybody: loadEverybody,
    luvPerson: luvPerson,
    luvPersonByEmail: luvPersonByEmail,
    luvSenderOfMessage: luvSenderOfMessage,
    showEmailForPerson: showEmailForPerson,
    sortPeopleBy: sortPeopleBy,
    getMessageBody: getMessageBody,
    openReplyWindow: openReplyWindow,
    startNewMailListener: startNewMailListener,
    openNewMailToAddress: openNewMailToAddress
  };
}();