// Namespace, to avoid variable name collisions in global namespace
var Lovebird_NS = function() {
  // Private stuff goes here:
  const Cu = Components.utils;
  const Ci = Components.interfaces;
  const Cc = Components.classes;
  Cu.import("resource://lovebird/modules/name_store.js");
  Cu.import("resource:///modules/mailServices.js"); // needed for MailServices.compose etc.
  Cu.import("resource://gre/modules/Services.jsm"); // needed for Services.io etc.

  let myEmail = "jono@fastmail.fm";
  let myPeople = {};
  // dictionary keyed on the email address of the person; will contain
  // identity object and message history for that person.

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
  
  function addRowToPplList(personId, latestMsg) {
    var rowData = {
      from: latestMsg.from.value,
      to: latestMsg.to[0].value,  	    // "to" is a list.
      subject: latestMsg.subject,
      date: latestMsg.date,
      uri: latestMsg.folderMessageURI,
      name: personId.contact.name
    };
    
    //let theList = document.getElementById("lb-main-list");
    let row = document.createElement('listitem');
    let cell = document.createElement('listcell');

    if (rowData.from == myEmail) {
      cell.setAttribute('label',
                        "Me to " + personId.contact.name);
      row.setAttribute("class", "sent");
    } else {
      cell.setAttribute('label',
                        personId.contact.name + " to me");
      row.setAttribute("class", "unanswered");
    }
    row.appendChild(cell);
    
    /*cell = document.createElement('listcell');
    cell.setAttribute('label', rowData.subject);
    row.appendChild(cell);
    
    cell = document.createElement('listcell');
    cell.setAttribute('label', rowData.date);
    row.appendChild(cell);*/
    
    row.setAttribute("lb_person_email", personId.value);
    //row.setAttribute("jono_data", rowData.uri);
 
    let personList = document.getElementById("lb-ppl-list");
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
      
      // store the whole collection in myPeople:
      var email = this.personId.value;
      // put it in reverse-chronological, newest first:
      myPeople[email].history = [];
      for (var i =0; i < collection.items.length; i++) {
        myPeople[email].history.unshift(collection.items[i]);
      }

      // add this new record to lovebird XUL list
      addRowToPplList(this.personId, 
                      myPeople[email].history[0]);
    }
  };

    // Public interface:
    return {
	openWindow: function() {
          openLovebirdTab();
	},
	
	onLoad: function() {
	    Cu.import("resource:///modules/gloda/public.js");
	    
	    /*See:  https://developer.mozilla.org/en-US/docs/Thunderbird/Creating_a_Gloda_message_query and
	     https://developer.mozilla.org/en-US/docs/Thunderbird/Gloda_examples
	    */

	    // Read list of lovely peeps from sqlite:
            LovebirdNameStore.dedupe();
	    LovebirdNameStore.getPeeps(function(peeps) {
		// Query for an identity for each:
		var id_q = Gloda.newQuery(Gloda.NOUN_IDENTITY);
		id_q.kind("email");

		/* use "apply" to make each name in myPeeps array an
		 * argument to id_q.value(). That will result in the
		 * query doing an OR across all of them. */
		dump("My peeps are " + peeps + "\n");
		id_q.value.apply(id_q, peeps);
              let id_coll=id_q.getCollection({
		    onItemsAdded: function _onAdded(aItems,
						    aCollection) {
		    },
		    onItemsModified: function _onModified(aItems,
							  aCollection) {
		    },
		    onItemsRemoved: function _onRemoved(aItems,
							aCollection) {
		    },
		    onQueryCompleted: function _onCompleted(id_coll) {
		      dump("There are " + id_coll.items.length +
			   " people\n");
		      // For each person we get back, do a query
		      // for that person's latest message:
                      for (var i = 0; i < id_coll.items.length; i++) {
                        
                        // Create entry in myPeople for this person
                        let email = id_coll.items[i].value;
                        if (!myPeople[email]) {
                          myPeople[email] = {
                            identity: id_coll.items[i]
                          };
                        }
                        
                        // Query for all messages to/from this person
			let query = Gloda.newQuery(Gloda.NOUN_MESSAGE);
                        let person = id_coll.items[i];
                        dump("Querying for " + person + "\n");
                        
			query.involves(person);
                        let listener = new MyQueryListener(person);
			let clcn = query.getCollection(listener);
		      }
		    } // end onQueryCompleted
		}); // end getCollection
	    }); // end getPeeps
	}, // end onLoad

	onUnload: function() {
	},

	contextClick: function(event) {
	    /* Called when you right-click a message and say 
	     * "luv this person". Gets email address of sender
	     * of selected message, adds it to favorites. */
	    var selectedMsg = gFolderDisplay.selectedMessage;
	    // this is a nsIMsgDBHdr
	    Gloda.getMessageCollectionForHeader(selectedMsg,
		{
		  onItemsAdded: function _onAdded(aItems,
						  aCollection) {
		  },
		  onItemsModified: function _onModified(aItems,
							aCollection) {
		  },
		  onItemsRemoved: function _onRemoved(aItems,
						      aCollection) {
		  },
		  onQueryCompleted: function _onCompleted(id_coll) {
		      var email = id_coll.items[0].from.value;
		      dump("Luving " + email + "\n");
		      LovebirdNameStore.rememberPeep(email);
		  }
		});
	},

      personListClick: function(event) {
        let clickedEmail = event.originalTarget.getAttribute("lb_person_email");
        
        var msgList = document.getElementById("lb-msg-list");
        clearList(msgList);
        
        var collection = myPeople[clickedEmail].history;

        for (var i = 0; i < collection.length; i++) {
          var msg = collection[i];
          let row = document.createElement('listitem');
          let cell = document.createElement('listcell');

          cell = document.createElement('listcell');
          cell.setAttribute('label', msg.subject);
          row.appendChild(cell);
    
          cell = document.createElement('listcell');
          cell.setAttribute('label', msg.date);
          row.appendChild(cell);

          // store message uri in attribute so double-click handler
          // can get uri out of click event target
          row.setAttribute("lb_msg_uri", msg.folderMessageURI);
 
          msgList.appendChild(row);
        }
        
      },

      msgListDblClick: function(event) {
	  let msgUri = event.originalTarget.getAttribute("lb_msg_uri");
          openReplyWindow(msgUri);
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

        let theList = document.getElementById("lb-ppl-list");
        clearList(theList);

        // make array to sort out of myPeople (person, lastMsg) tuples
        var arrayToSort = [];
        for (var email in myPeople) {
          arrayToSort.push({personId: myPeople[email].identity,
                            lastMsg: myPeople[email].history[0]});
        }

        // sort it according to sort function
        arrayToSort.sort(sortFunction);

        // refill list with newly ordered records
        for (var i = 0; i < arrayToSort.length; i++) {
          addRowToPplList(arrayToSort[i].personId,
                          arrayToSort[i].lastMsg);
        }
      } // end sortBy function
    }; // end public interface object
}(); // immediately call function to create namespace object