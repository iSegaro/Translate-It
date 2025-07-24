// build-scripts/logger.js

/* eslint-disable no-undef */

import chalk from "chalk";

export function logSuccess(message) {
  console.log(chalk.green.bold('✅ ' + message))
}

export function logError(message, details) {
  console.log(chalk.red.bold('❌ ' + message))
  if (details) {
    console.log(chalk.red('   ' + details))
  }
}

export function logInfo(message) {
  console.log(chalk.blue('ℹ️  ' + message))
}

export function logStep(name) {
  const styleMap = [
    {
      keyword: "chrome",
      icon: "🚀",
      color: chalk.blue.bold,
    },
    {
      keyword: "firefox",
      icon: "🦊",
      color: chalk.hex("#FF8800").bold, // نارنجی برای فایرفاکس
    },
    {
      keyword: "watch",
      icon: "👀",
      color: chalk.yellow.bold,
    },
    {
      keyword: "build",
      icon: "📦",
      color: chalk.green.bold,
    },
  ];

  const matched = styleMap.find(({ keyword }) =>
    name.toLowerCase().includes(keyword)
  );

  const icon = matched?.icon || "✨";
  const color = matched?.color || chalk.white.bold;

  console.log(color(`\n${icon} ${name}...\n`));
}
