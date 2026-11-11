import { exec } from "child_process";
import { promisify } from "util";
import { Plugin } from "@utils/pluginBase";
import { Api } from "teleproto";

const execAsync = promisify(exec);
// 默认 1MB 的输出上限很容易被超过并导致命令被判定为失败
const EXEC_MAX_BUFFER = 16 * 1024 * 1024;

function htmlEscape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const activeIntervals = new Set<ReturnType<typeof setInterval>>();

// 先截断原始文本再转义，避免把 HTML 实体或标签截成两半
function clip(text: string, max: number) {
  if (text.length <= max) return htmlEscape(text);
  return htmlEscape(text.slice(0, max)) + "\n…(输出过长，已截断)";
}

async function handleExec(params: { msg: Api.Message; shellCommand: string }) {
  const { msg, shellCommand } = params;

  const start = Date.now();
  // 使用 HTML 并转义：markdown 模式下输出里的 _ * ` 等字符会被当成格式符号吃掉
  const cmdHtml = clip(shellCommand, 500);

  await msg.edit({
    text:
      `✅ 已开始执行 shell 命令…\n` +
      `命令：<code>${cmdHtml}</code>\n` +
      `状态：运行中 0s`,
    parseMode: "html",
  });

  let stopped = false;

  const timer = setInterval(async () => {
    if (stopped) return;
    const cost = ((Date.now() - start) / 1000).toFixed(0);
    try {
      await msg.edit({
        text:
          `✅ 已开始执行 shell 命令…\n` +
          `命令：<code>${cmdHtml}</code>\n` +
          `状态：运行中 ${cost}s`,
        parseMode: "html",
      });
    } catch {}
  }, 2000);
  activeIntervals.add(timer);

  try {
    const { stdout, stderr } = await execAsync(shellCommand, {
      maxBuffer: EXEC_MAX_BUFFER,
    });
    stopped = true;
    clearInterval(timer);
    activeIntervals.delete(timer);

    const costMs = Date.now() - start;

    let text =
      `✅ 执行完成（${(costMs / 1000).toFixed(2)}s）\n` +
      `命令：<code>${cmdHtml}</code>\n\n` +
      `shell 输出：\n<pre>${clip(stdout || "(无输出)", stderr ? 2000 : 3000)}</pre>`;

    if (stderr) {
      text += `\n\nshell 错误：\n<pre>${clip(stderr, 1000)}</pre>`;
    }

    await msg.edit({
      text,
      parseMode: "html",
    });
  } catch (error: any) {
    stopped = true;
    clearInterval(timer);
    activeIntervals.delete(timer);

    const costMs = Date.now() - start;

    await msg.edit({
      text:
        `❌ 执行失败（${(costMs / 1000).toFixed(2)}s）\n` +
        `命令：<code>${cmdHtml}</code>\n\n` +
        `错误：\n<pre>${clip(String(error), 3000)}</pre>`,
      parseMode: "html",
    });
  }
}

class ExecPlugin extends Plugin {
  cleanup(): void {
    // 真实资源清理：释放插件持有的定时器、监听器、运行时状态或临时资源。
    for (const timer of activeIntervals) {
      clearInterval(timer);
    }
    activeIntervals.clear();
  }

  description: string = `运行 shell 命令`;
  cmdHandlers: Record<string, (msg: Api.Message) => Promise<void>> = {
    exec: async (msg) => {
      // 去掉 "前缀+命令名"，剩余部分即 shell 命令（前缀可能不止一个字符）
      const shellCommand = msg.message.replace(/^\S+\s*/, "").trim();
      if (!shellCommand) {
        await msg.edit({ text: "请提供要执行的 shell 命令" });
        return;
      }
      await handleExec({ msg, shellCommand });
    },
  };
}

export default new ExecPlugin();
