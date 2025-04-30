// This plugin allows extracting variables and styles from a Figma document
// as JSON files for design system integration.

// This file holds the main code for plugins. Code in this file has access to
// the *figma document* via the figma global object.
// You can access browser APIs in the <script> tag inside "ui.html" which has a
// full browser environment (See https://www.figma.com/plugin-docs/how-plugins-run).

// This shows the HTML page in "ui.html".
figma.showUI(__html__, { width: 450, height: 700 });

// Simple communication test - send a message as soon as the plugin loads
figma.ui.postMessage({
  type: 'plugin-loaded',
  message: 'Plugin has loaded successfully',
});

// Load variables and styles when plugin starts
loadAndDisplayVariables();
loadAndDisplayStyles();

// When the plugin starts, send a message to UI with current selection
const currentSelection = figma.currentPage.selection;
figma.ui.postMessage({
  type: 'initial-selection',
  hasSelection: currentSelection.length > 0,
  selectionCount: currentSelection.length,
  selectionTypes: currentSelection.map((node) => node.type),
});

// Handle selection changes
figma.on('selectionchange', () => {
  const selection = figma.currentPage.selection;
  figma.ui.postMessage({
    type: 'selection-changed',
    hasSelection: selection.length > 0,
    selectionCount: selection.length,
    selectionTypes: selection.map((node) => node.type),
  });
});

// Handle messages from UI
figma.ui.onmessage = async (msg) => {
  console.log('Message received from UI:', msg.type);

  // Always reply with an echo to confirm receipt
  figma.ui.postMessage({
    type: 'echo-reply',
    originalMessage: msg.type,
    timestamp: Date.now(),
  });

  if (msg.type === 'ping') {
    // Simple ping/pong to test communication
    figma.ui.postMessage({
      type: 'pong',
      timestamp: Date.now(),
    });
  } else if (msg.type === 'get-selection') {
    // Get current selection
    const selection = figma.currentPage.selection;
    figma.ui.postMessage({
      type: 'selection-info',
      selection: selection.map((node) => ({
        id: node.id,
        name: node.name,
        type: node.type,
      })),
    });
  } else if (msg.type === 'analyze-selection') {
    // Simple analysis that just returns basic info
    const selection = figma.currentPage.selection;

    if (selection.length === 1) {
      const node = selection[0];

      // Try to export a simple image if possible
      let imageData = null;
      try {
        if ('exportAsync' in node) {
          const bytes = await (node as ExportMixin).exportAsync({
            format: 'PNG',
            constraint: { type: 'WIDTH', value: 300 },
          });
          const base64 = figma.base64Encode(bytes);
          imageData = `data:image/png;base64,${base64}`;
        }
      } catch (e) {
        console.error('Export error:', e);
      }

      // Send basic node info
      figma.ui.postMessage({
        type: 'simple-analysis',
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        hasImage: !!imageData,
        imageData: imageData,
      });
    } else {
      figma.ui.postMessage({
        type: 'simple-analysis-error',
        message: `Please select exactly one node (current: ${selection.length})`,
      });
    }
  } else if (msg.type === 'extract-variables') {
    await extractVariables();
  } else if (msg.type === 'extract-styles') {
    await extractStyles();
  } else if (msg.type === 'cancel') {
    figma.closePlugin();
  }
};

// Helper function to pad strings (alternative to padStart)
function padString(str: string, length: number, char: string): string {
  while (str.length < length) {
    str = char + str;
  }
  return str;
}

async function loadAndDisplayVariables() {
  try {
    const collections =
      await figma.variables.getLocalVariableCollectionsAsync();
    const variables = await figma.variables.getLocalVariablesAsync();

    const variablesData = variables.map((variable) => {
      const collection = collections.find(
        (c) => c.id === variable.variableCollectionId
      );
      return {
        id: variable.id,
        name: variable.name,
        type: variable.resolvedType,
        collectionName: collection?.name || 'Unknown Collection',
        values: variable.valuesByMode,
      };
    });

    figma.ui.postMessage({
      type: 'variables-data',
      variables: variablesData,
    });
  } catch (error) {
    console.error('Error loading variables:', error);
    figma.ui.postMessage({
      type: 'variables-error',
      message: 'Failed to load variables',
    });
  }
}

async function loadAndDisplayStyles() {
  try {
    // Get all styles in the document using async methods
    const paintStyles = await figma.getLocalPaintStylesAsync();
    const textStyles = await figma.getLocalTextStylesAsync();

    // Process paint styles
    const paintStylesData = paintStyles.map((style) => {
      const styleDetails = {
        id: style.id,
        name: style.name,
        type: style.type,
        key: style.key,
        description: style.description || '',
        hexColor: '',
        isComplex: false,
        color: null as { r: number; g: number; b: number; a: number } | null,
      };

      // Paint style (colors)
      if (style.paints.length > 0 && style.paints[0].type === 'SOLID') {
        const solidPaint = style.paints[0] as SolidPaint;
        styleDetails.color = {
          r: solidPaint.color.r,
          g: solidPaint.color.g,
          b: solidPaint.color.b,
          a: solidPaint.opacity !== undefined ? solidPaint.opacity : 1,
        };

        // Convert to hex
        const r = Math.round(solidPaint.color.r * 255);
        const g = Math.round(solidPaint.color.g * 255);
        const b = Math.round(solidPaint.color.b * 255);
        const a = solidPaint.opacity !== undefined ? solidPaint.opacity : 1;
        styleDetails.hexColor =
          '#' +
          padString(r.toString(16), 2, '0') +
          padString(g.toString(16), 2, '0') +
          padString(b.toString(16), 2, '0');

        if (a < 1) {
          const alpha = Math.round(a * 255);
          styleDetails.hexColor += padString(alpha.toString(16), 2, '0');
        }
      } else {
        styleDetails.isComplex = true;
      }

      return styleDetails;
    });

    // Process text styles
    const textStylesData = textStyles.map((style) => {
      return {
        id: style.id,
        name: style.name,
        type: style.type,
        key: style.key,
        description: style.description || '',
        fontName: style.fontName,
        fontSize: style.fontSize,
        letterSpacing: style.letterSpacing,
        lineHeight: style.lineHeight,
        paragraphIndent: style.paragraphIndent,
        paragraphSpacing: style.paragraphSpacing,
        textCase: style.textCase,
        textDecoration: style.textDecoration,
      };
    });

    // Combine both types of styles
    const stylesData = [...paintStylesData, ...textStylesData];

    figma.ui.postMessage({
      type: 'styles-data',
      styles: stylesData,
    });
  } catch (error) {
    console.error('Error loading styles:', error);
    figma.ui.postMessage({
      type: 'styles-error',
      message: 'Failed to load styles',
    });
  }
}

async function extractVariables() {
  try {
    const collections =
      await figma.variables.getLocalVariableCollectionsAsync();
    const variables = await figma.variables.getLocalVariablesAsync();

    const variablesData = {
      collections: collections.map((collection) => ({
        id: collection.id,
        name: collection.name,
        modes: collection.modes,
      })),
      variables: variables.map((variable) => ({
        id: variable.id,
        name: variable.name,
        type: variable.resolvedType,
        collectionId: variable.variableCollectionId,
        values: variable.valuesByMode,
      })),
    };

    // Create a download link for the JSON file
    const jsonStr = JSON.stringify(variablesData, null, 2);

    // Use Figma's file system to save the file
    figma.ui.postMessage({
      type: 'download-file',
      content: jsonStr,
      filename: 'variables.json',
    });
  } catch (error) {
    console.error('Error extracting variables:', error);
    figma.ui.postMessage({
      type: 'extract-error',
      message: 'Failed to extract variables',
    });
  }
}

async function extractStyles() {
  try {
    // Get all styles in the document using async methods
    const paintStyles = await figma.getLocalPaintStylesAsync();
    const textStyles = await figma.getLocalTextStylesAsync();

    // Process paint styles
    const paintStylesData = paintStyles.map((style) => {
      const styleDetails = {
        id: style.id,
        name: style.name,
        type: style.type,
        key: style.key,
        description: style.description || '',
        hexColor: '',
        isComplex: false,
        color: null as { r: number; g: number; b: number; a: number } | null,
      };

      // Paint style (colors)
      if (style.paints.length > 0 && style.paints[0].type === 'SOLID') {
        const solidPaint = style.paints[0] as SolidPaint;
        styleDetails.color = {
          r: solidPaint.color.r,
          g: solidPaint.color.g,
          b: solidPaint.color.b,
          a: solidPaint.opacity !== undefined ? solidPaint.opacity : 1,
        };

        // Convert to hex
        const r = Math.round(solidPaint.color.r * 255);
        const g = Math.round(solidPaint.color.g * 255);
        const b = Math.round(solidPaint.color.b * 255);
        const a = solidPaint.opacity !== undefined ? solidPaint.opacity : 1;
        styleDetails.hexColor =
          '#' +
          padString(r.toString(16), 2, '0') +
          padString(g.toString(16), 2, '0') +
          padString(b.toString(16), 2, '0');

        if (a < 1) {
          const alpha = Math.round(a * 255);
          styleDetails.hexColor += padString(alpha.toString(16), 2, '0');
        }
      } else {
        styleDetails.isComplex = true;
      }

      return styleDetails;
    });

    // Process text styles
    const textStylesData = textStyles.map((style) => {
      return {
        id: style.id,
        name: style.name,
        type: style.type,
        key: style.key,
        description: style.description || '',
        fontName: style.fontName,
        fontSize: style.fontSize,
        letterSpacing: style.letterSpacing,
        lineHeight: style.lineHeight,
        paragraphIndent: style.paragraphIndent,
        paragraphSpacing: style.paragraphSpacing,
        textCase: style.textCase,
        textDecoration: style.textDecoration,
      };
    });

    // Combine both types of styles
    const stylesData = [...paintStylesData, ...textStylesData];

    // Create a download link for the JSON file
    const jsonStr = JSON.stringify(stylesData, null, 2);

    // Use Figma's file system to save the file
    figma.ui.postMessage({
      type: 'download-file',
      content: jsonStr,
      filename: 'styles.json',
    });
  } catch (error) {
    console.error('Error extracting styles:', error);
    figma.ui.postMessage({
      type: 'extract-error',
      message: 'Failed to extract styles',
    });
  }
}
