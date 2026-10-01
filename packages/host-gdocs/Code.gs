/**
 * Google Apps Script Server-Side Script for Google Docs Research Assistant
 */

function onOpen() {
  DocumentApp.getUi()
    .createMenu('Research Assistant')
    .addItem('Open Sidebar', 'showSidebar')
    .addToUi();
}

function showSidebar() {
  var html = HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle('Research & Documentation Assistant')
    .setWidth(380);
  DocumentApp.getUi().showSidebar(html);
}

function getParagraphsRpc() {
  var doc = DocumentApp.getActiveDocument();
  var body = doc.getBody();
  var numChildren = body.getNumChildren();
  var list = [];

  for (var i = 0; i < numChildren; i++) {
    var child = body.getChild(i);
    if (child.getType() === DocumentApp.ElementType.PARAGRAPH) {
      var p = child.asParagraph();
      var text = p.getText().trim();
      if (!text) continue;

      var heading = p.getHeading();
      var headingLevel = 0;
      if (heading === DocumentApp.ParagraphHeading.HEADING1) headingLevel = 1;
      else if (heading === DocumentApp.ParagraphHeading.HEADING2) headingLevel = 2;
      else if (heading === DocumentApp.ParagraphHeading.HEADING3) headingLevel = 3;

      list.push({
        index: i,
        text: text,
        headingLevel: headingLevel
      });
    }
  }

  return JSON.stringify(list);
}

function getSelectionRpc() {
  var doc = DocumentApp.getActiveDocument();
  var selection = doc.getSelection();
  if (!selection) return null;

  var elements = selection.getRangeElements();
  var texts = [];

  for (var i = 0; i < elements.length; i++) {
    var el = elements[i].getElement();
    if (el.asText) {
      texts.push(el.asText().getText());
    }
  }

  return texts.join('\n');
}

function applyEditRpc(original, replacement) {
  var doc = DocumentApp.getActiveDocument();
  var body = doc.getBody();
  var found = body.findText(escapeRegex(original));

  if (!found) {
    return { success: false, error: 'Text not found in document.' };
  }

  var el = found.getElement().asText();
  var start = found.getStartOffset();
  var end = found.getEndOffsetInclusive();

  el.deleteText(start, end);
  el.insertText(start, replacement);

  return { success: true };
}

function insertContentRpc(markdown) {
  var doc = DocumentApp.getActiveDocument();
  var cursor = doc.getCursor();
  if (cursor) {
    cursor.insertText(markdown);
  } else {
    doc.getBody().appendParagraph(markdown);
  }
  return true;
}

function getUserKeyRpc(key) {
  return PropertiesService.getUserProperties().getProperty(key);
}

function setUserKeyRpc(key, val) {
  PropertiesService.getUserProperties().setProperty(key, val);
  return true;
}

function escapeRegex(string) {
  return string.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}
