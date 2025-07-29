// src/handlers/selectElementStatesHandler.js

import { logME } from "../utils/helpers.js";

// Note: selectElementStates (the state object itself) is passed as an argument

export function handleUpdateSelectElementState(
  message,
  sender,
  selectElementStates,
) {
  if (sender.tab?.id) {
    selectElementStates[sender.tab.id] = message.data;
    logME(
      `[Handler:State] Updated selectElementState for tab ${sender.tab.id}:`,
      message.data,
    );
  } else {
    logME(
      "[Handler:State] Received UPDATE_SELECT_ELEMENT_STATE without tab ID.",
    );
  }
  // No response needed, synchronous
  return false;
}
