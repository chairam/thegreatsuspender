/*global chrome */
(function() {
  'use strict';

  var gsSession = chrome.extension.getBackgroundPage().gsSession;
  var gsUtils = chrome.extension.getBackgroundPage().gsUtils;
  var tgs = chrome.extension.getBackgroundPage().tgs;
  var globalActionElListener;

  var getTabStatus = function(retriesRemaining, callback) {
    tgs.getActiveTabStatus(function(status) {
      if (chrome.runtime.lastError) {
        gsUtils.error('popup', chrome.runtime.lastError);
      }
      if (status !== gsUtils.STATUS_UNKNOWN && status !== gsUtils.STATUS_LOADING) {
        callback(status);
      } else if (retriesRemaining === 0) {
        callback(status);
      } else {
        var timeout = 1000;
        if (!gsSession.isInitialising()) {
          retriesRemaining--;
          timeout = 200;
        }
        setTimeout(function() {
          getTabStatus(retriesRemaining, callback);
        }, timeout);
      }
    });
  };
  var initialTabStatusAsPromised = new Promise(function(resolve, reject) {
    getTabStatus(0, resolve);
  });
  var tabStatusAsPromised = new Promise(function(resolve, reject) {
    var retries = 50; //each retry is 200ms which makes 10 seconds
    getTabStatus(retries, function(status) {
      if (status === gsUtils.STATUS_UNKNOWN || status === gsUtils.STATUS_LOADING) {
        status = 'error';
      }
      resolve(status);
    });
  });
  var selectedTabsAsPromised = new Promise(function(resolve, reject) {
    chrome.tabs.query({ highlighted: true, lastFocusedWindow: true }, function(
      tabs
    ) {
      resolve(tabs);
    });
  });

  Promise.all([
    gsUtils.documentReadyAndLocalisedAsPromsied(document),
    initialTabStatusAsPromised,
    selectedTabsAsPromised,
  ]).then(function([domLoadedEvent, initialTabStatus, selectedTabs]) {
    setSuspendCurrentVisibility(initialTabStatus);
    setSuspendSelectedVisibility(selectedTabs);
    setStatus(initialTabStatus);
    showPopupContents();
    addClickHandlers();

    if (initialTabStatus === gsUtils.STATUS_UNKNOWN || initialTabStatus === gsUtils.STATUS_LOADING) {
      tabStatusAsPromised.then(function(finalTabStatus) {
        setSuspendCurrentVisibility(finalTabStatus);
        setStatus(finalTabStatus);
      });
    }
  });

  function setSuspendCurrentVisibility(tabStatus) {
    var suspendOneVisible = ![
        gsUtils.STATUS_SUSPENDED,
        gsUtils.STATUS_SPECIAL,
        gsUtils.STATUS_LOADING,
        gsUtils.STATUS_UNKNOWN,
      ].includes(tabStatus),
      whitelistVisible = ![
        gsUtils.STATUS_WHITELISTED,
        gsUtils.STATUS_SPECIAL,
        gsUtils.STATUS_LOADING,
        gsUtils.STATUS_UNKNOWN,
      ].includes(tabStatus),
      unsuspendVisible = [gsUtils.STATUS_SUSPENDED].includes(tabStatus);

    if (suspendOneVisible) {
      document.getElementById('suspendOne').style.display = 'block';
    } else {
      document.getElementById('suspendOne').style.display = 'none';
    }

    if (whitelistVisible) {
      document.getElementById('whitelistPage').style.display = 'block';
      document.getElementById('whitelistDomain').style.display = 'block';
    } else {
      document.getElementById('whitelistPage').style.display = 'none';
      document.getElementById('whitelistDomain').style.display = 'none';
    }

    if (suspendOneVisible || whitelistVisible) {
      document.getElementById('optsCurrent').style.display = 'block';
    } else {
      document.getElementById('optsCurrent').style.display = 'none';
    }

    if (unsuspendVisible) {
      document.getElementById('unsuspendOne').style.display = 'block';
    } else {
      document.getElementById('unsuspendOne').style.display = 'none';
    }
  }

  function setSuspendSelectedVisibility(selectedTabs) {
    if (selectedTabs && selectedTabs.length > 1) {
      document.getElementById('optsSelected').style.display = 'block';
    } else {
      document.getElementById('optsSelected').style.display = 'none';
    }
  }

  function setStatus(status) {
    var statusDetail = '';
    //  statusIconClass = '';

    // Update status icon and text
    if (status === gsUtils.STATUS_NORMAL || status === gsUtils.STATUS_ACTIVE) {
      statusDetail =
        chrome.i18n.getMessage('js_popup_normal') +
        " <a href='#'>" +
        chrome.i18n.getMessage('js_popup_normal_pause') +
        '</a>';
      //    statusIconClass = 'fa fa-clock-o';
    } else if (status === gsUtils.STATUS_SUSPENDED) {
      statusDetail =
        chrome.i18n.getMessage('js_popup_suspended') +
        " <a href='#'>" +
        chrome.i18n.getMessage('js_popup_suspended_pause') +
        '</a>';
      //    statusIconClass = 'fa fa-pause';
    } else if (status === gsUtils.STATUS_NEVER) {
      statusDetail = chrome.i18n.getMessage('js_popup_never');
      //    statusIconClass = 'fa fa-ban';
    } else if (status === gsUtils.STATUS_SPECIAL) {
      statusDetail = chrome.i18n.getMessage('js_popup_special');
      //    statusIconClass = 'fa fa-remove';
    } else if (status === gsUtils.STATUS_WHITELISTED) {
      statusDetail =
        chrome.i18n.getMessage('js_popup_whitelisted') +
        " <a href='#'>" +
        chrome.i18n.getMessage('js_popup_whitelisted_remove') +
        '</a>';
      //    statusIconClass = 'fa fa-check';
    } else if (status === gsUtils.STATUS_AUDIBLE) {
      statusDetail = chrome.i18n.getMessage('js_popup_audible');
      //    statusIconClass = 'fa fa-volume-up';
    } else if (status === gsUtils.STATUS_FORMINPUT) {
      statusDetail =
        chrome.i18n.getMessage('js_popup_form_input') +
        " <a href='#'>" +
        chrome.i18n.getMessage('js_popup_form_input_unpause') +
        '</a>';
      //    statusIconClass = 'fa fa-edit';
    } else if (status === gsUtils.STATUS_PINNED) {
      statusDetail = chrome.i18n.getMessage('js_popup_pinned'); //  statusIconClass = 'fa fa-thumb-tack';
    } else if (status === gsUtils.STATUS_TEMPWHITELIST) {
      statusDetail =
        chrome.i18n.getMessage('js_popup_temp_whitelist') +
        " <a href='#'>" +
        chrome.i18n.getMessage('js_popup_temp_whitelist_unpause') +
        '</a>';
      //    statusIconClass = 'fa fa-pause';
    } else if (status === gsUtils.STATUS_NOCONNECTIVITY) {
      statusDetail = chrome.i18n.getMessage('js_popup_no_connectivity');
      //    statusIconClass = 'fa fa-plane';
    } else if (status === gsUtils.STATUS_CHARGING) {
      statusDetail = chrome.i18n.getMessage('js_popup_charging');
      //    statusIconClass = 'fa fa-plug';
    } else if (status === gsUtils.STATUS_LOADING || status === gsUtils.STATUS_UNKNOWN) {
      if (gsSession.isInitialising()) {
        statusDetail = chrome.i18n.getMessage('js_popup_initialising');
      } else {
        statusDetail = chrome.i18n.getMessage('js_popup_unknown');
      }
      //    statusIconClass = 'fa fa-circle-o-notch';
    } else if (status === 'error') {
      statusDetail = chrome.i18n.getMessage('js_popup_error');
      //    statusIconClass = 'fa fa-exclamation-triangle';
    } else {
      gsUtils.log('popup', 'Could not process tab status of: ' + status);
    }
    document.getElementById('statusDetail').innerHTML = statusDetail;
    //  document.getElementById('statusIcon').className = statusIconClass;
    // if (status === gsUtils.STATUS_UNKNOWN || status === gsUtils.STATUS_LOADING) {
    //     document.getElementById('statusIcon').classList.add('fa-spin');
    // }

    document.getElementById('header').classList.remove('willSuspend');
    if (status === gsUtils.STATUS_NORMAL || status === gsUtils.STATUS_ACTIVE) {
      document.getElementById('header').classList.add('willSuspend');
    }

    // Update action handler
    var actionEl = document.getElementsByTagName('a')[0];
    if (actionEl) {
      var tgsHanderFunc;
      if (status === gsUtils.STATUS_NORMAL || status === gsUtils.STATUS_ACTIVE) {
        tgsHanderFunc = tgs.temporarilyWhitelistHighlightedTab;
      } else if (status === gsUtils.STATUS_SUSPENDED) {
        tgsHanderFunc = tgs.temporarilyWhitelistHighlightedTab;
      } else if (status === gsUtils.STATUS_WHITELISTED) {
        tgsHanderFunc = tgs.unwhitelistHighlightedTab;
      } else if (status === gsUtils.STATUS_FORMINPUT || status === gsUtils.STATUS_TEMPWHITELIST) {
        tgsHanderFunc = tgs.undoTemporarilyWhitelistHighlightedTab;
      }

      if (globalActionElListener) {
        actionEl.removeEventListener('click', globalActionElListener);
      }
      if (tgsHanderFunc) {
        globalActionElListener = function(e) {
          tgsHanderFunc();
          window.close();
        };
        actionEl.addEventListener('click', globalActionElListener);
      }
    }
  }

  function showPopupContents() {
    setTimeout(function() {
      document.getElementById('popupContent').style.opacity = 1;
    }, 200);
  }

  function addClickHandlers() {
    document
      .getElementById('unsuspendOne')
      .addEventListener('click', function(e) {
        tgs.unsuspendHighlightedTab();
        window.close();
      });
    document
      .getElementById('suspendOne')
      .addEventListener('click', function(e) {
        tgs.suspendHighlightedTab();
        window.close();
      });
    document
      .getElementById('suspendAll')
      .addEventListener('click', function(e) {
        tgs.suspendAllTabs();
        window.close();
      });
    document
      .getElementById('unsuspendAll')
      .addEventListener('click', function(e) {
        tgs.unsuspendAllTabs();
        window.close();
      });
    document
      .getElementById('suspendSelected')
      .addEventListener('click', function(e) {
        tgs.suspendSelectedTabs();
        window.close();
      });
    document
      .getElementById('unsuspendSelected')
      .addEventListener('click', function(e) {
        tgs.unsuspendSelectedTabs();
        window.close();
      });
    document
      .getElementById('whitelistDomain')
      .addEventListener('click', function(e) {
        tgs.whitelistHighlightedTab(false);
        window.close();
      });
    document
      .getElementById('whitelistPage')
      .addEventListener('click', function(e) {
        tgs.whitelistHighlightedTab(true);
        window.close();
      });
    document
      .getElementById('settingsLink')
      .addEventListener('click', function(e) {
        chrome.tabs.create({
          url: chrome.extension.getURL('options.html'),
        });
        window.close();
      });
  }
})();
