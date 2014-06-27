/*jslint evil:true*/
/*global app, $on */
(function () {
  'use strict';

  // Supported CSS properties that accept shape values.
  // NOTE: unprefixed clip-path applies only to SVG; use -webkit- prefix for SVG & HTML.
  var CSS_PROPERTIES = ['shape-outside', 'shape-inside', '-webkit-clip-path'];

  // DOM equivalent of CSS properties used to query getComputedStyle() result.
  var DOM_PROPERTIES = CSS_PROPERTIES.map(window.toDOMProperty);

  // extension instance
  var ext;

  function Extension(root) {
    var self = this;

    if (!root){
      throw new Error('Missing root window for View');
    }

    self.view = new app.View(root);

    self.port = chrome.runtime.connect({name: "devtools"});
    self.port.onMessage.addListener(function(msg) {

      switch (msg.type){
        case "update":
          self.model.update(msg.property, { value: msg.value });
        break;

        case "remove":
          // self.model.update(msg.property, { enabled: false });
        break;
      }
    });
  }

  Extension.prototype.init = function(){
    var self = this;

    self.getSelectedElementStyles().then(function(data){

      self.model = new app.Model(data);

      self.controller = new app.Controller(self.model, self.view);
      self.controller.on('editorStateChange', function(editor){
        self.onEditorStateChange.call(self, editor);
      });

      self.controller.setView();
    });

    // store a reference to the 'this'-bound event handler so we can
    // release it with removeListener() in Extension.teardown()
    // oh, JavaScript!
    self.boundSelectedElementChange = function(scope){
      return function(){
        scope.onSelectedElementChange.call(scope);
      };
    }(self);

    chrome.devtools.panels.elements.onSelectionChanged.addListener(self.boundSelectedElementChange);
  };

  Extension.prototype.teardown = function(){
    if (this.activeEditor){
      this.removeEditor(this.activeEditor);
    }

    this.controller.off('editorStateChange');
    this.controller = null;
    this.model = null;

    chrome.devtools.panels.elements.onSelectionChanged.removeListener(this.boundSelectedElementChange);
  };

  Extension.prototype.onSelectedElementChange = function(){
    var self = this;

    if (this.activeEditor){
      this.removeEditor(this.activeEditor);
    }

    self.getSelectedElementStyles().then(function(data){
      self.controller.setModel(new app.Model(data));
      self.controller.setView();
    });
  };

  Extension.prototype.onEditorStateChange = function(editor){
    if (editor.enabled){
      this.setupEditor(editor);
    } else {
      this.removeEditor(editor);
    }
  };

  Extension.prototype.setupEditor = function(editor){
    chrome.devtools.inspectedWindow.eval('setup($0, "'+ editor.property.toString() +'", "'+ editor.value.toString() +'")', { useContentScriptContext: true });
    this.activeEditor = editor;
  };

  Extension.prototype.removeEditor = function(editor){
    chrome.devtools.inspectedWindow.eval('remove("'+ editor.property.toString() +'")', { useContentScriptContext: true });
    this.activeEditor = null;
  };

  Extension.prototype.getSelectedElementStyles = function(){
    return new Promise(function(resolve, reject){

      function extractStyles(style){
        var data = {};

        style = JSON.parse(style);

        CSS_PROPERTIES.forEach(function(prop, index){
          var domProp = DOM_PROPERTIES[index];

          if (!style[domProp]){
            return;
          }
          data[prop] = {
            property: prop,
            value: style[domProp],
            enabled: false
          };
        });

        resolve(data);
      }

      chrome.devtools.inspectedWindow.eval("JSON.stringify(window.getComputedStyle($0, null))", extractStyles);
    });
  };

  document.addEventListener('DOMContentLoaded', function(){
    chrome.devtools.panels.elements.createSidebarPane("Shapes",
      function(sidebar) {
        sidebar.setPage('sidebar.html');
        sidebar.setHeight('100vh');

        var setupOnce = _.once(function(contentWindow){
            return new Extension(contentWindow);
        });

        sidebar.onShown.addListener(function(contentWindow){
          ext = setupOnce(contentWindow);
          ext.init();
        });

        sidebar.onHidden.addListener(function(){
          ext.teardown();
        });
    });
  });

})();