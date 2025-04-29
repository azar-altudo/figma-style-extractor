// This plugin allows extracting variables and styles from a Figma document
// as JSON files for design system integration.

// This file holds the main code for plugins. Code in this file has access to
// the *figma document* via the figma global object.
// You can access browser APIs in the <script> tag inside "ui.html" which has a
// full browser environment (See https://www.figma.com/plugin-docs/how-plugins-run).

// This shows the HTML page in "ui.html".
figma.showUI(__html__, { width: 400, height: 600 });

// Load variables and styles when plugin starts
loadAndDisplayVariables();
loadAndDisplayStyles();

// Helper function to pad strings (alternative to padStart)
function padString(str: string, length: number, char: string): string {
  while (str.length < length) {
    str = char + str;
  }
  return str;
}

// Calls to "parent.postMessage" from within the HTML page will trigger this
// callback. The callback will be passed the "pluginMessage" property of the
// posted message.
figma.ui.onmessage = async (msg: { type: string }) => {
  // One way of distinguishing between different types of messages sent from
  // your HTML page is to use an object with a "type" property like this.
  if (msg.type === 'extract-variables') {
    await extractVariables();
  } else if (msg.type === 'extract-styles') {
    await extractStyles();
  } else if (msg.type === 'cancel') {
    figma.closePlugin();
  }
};

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
  }
}
