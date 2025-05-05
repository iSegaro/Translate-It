// build-scripts/logger.js

import chalk from "chalk";

export function logStep(name) {
  const styleMap = [
    {
      keyword: "chrome",
      icon: "🚀",
      color: chalk.blue.bold,
    },
    {
      keyword: "edge",
      icon: "⚡",
      color: chalk.hex("#0078D7").bold, // ابی کم رنگ
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
