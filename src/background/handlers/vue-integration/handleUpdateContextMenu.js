// Handler for updating context menu from Vue apps
import { ErrorTypes } from "../../../error-management/ErrorTypes.js";
import { ErrorHandler } from "../../../error-management/ErrorHandler.js";
import browser from "webextension-polyfill";

const errorHandler = new ErrorHandler();

export async function handleUpdateContextMenu(message) {
  const { menuItems } = message.data;

  try {
    // Remove existing context menu items
    await browser.contextMenus.removeAll();

    // Add new menu items
    if (menuItems && Array.isArray(menuItems)) {
      for (const item of menuItems) {
        await browser.contextMenus.create(item);
      }
    }

    return {
      success: true,
      data: {
        success: true,
        message: "Context menu updated",
      },
    };
  } catch (error) {
    errorHandler.handle(error, {
      type: ErrorTypes.CONTEXT_MENU,
      context: "handleUpdateContextMenu",
      messageData: message.data,
    });
    throw error;
  }
}