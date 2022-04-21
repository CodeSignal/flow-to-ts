import { Command } from "commander";
import fs from "fs";
import glob from "glob";
import prettier from "prettier";
import simpleGit from "simple-git";

import { convert } from "./convert";
import { detectJsx } from "./detect-jsx";
import { version } from "../package.json";

export const cli = async (argv) => {
  const program = new Command();
  program
    .version(version)
    .option(
      "--inline-utility-types",
      "inline utility types when possible, defaults to 'false'"
    )
    .option("--prettier", "use prettier for formatting")
    .option(
      "--semi",
      "add semi-colons, defaults to 'false' (depends on --prettier)"
    )
    .option(
      "--keep-untyped",
      "do not change files that do not have @flow at the top"
    )
    .option(
      "--single-quote",
      "use single quotes instead of double quotes, defaults to 'false' (depends on --prettier)"
    )
    .option(
      "--tab-width [width]",
      "size of tabs (depends on --prettier)",
      /2|4/,
      4
    )
    .option(
      "--trailing-comma [all|es5|none]",
      "where to put trailing commas (depends on --prettier)",
      /all|es5|none/,
      "all"
    )
    .option(
      "--bracket-spacing",
      "put spaces between braces and contents, defaults to 'false' (depends on --prettier)"
    )
    .option(
      "--arrow-parens [avoid|always]",
      "arrow function param list parens (depends on --prettier)",
      /avoid|always/,
      "avoid"
    )
    .option("--print-width [width]", "line width (depends on --prettier)", 80)
    .option(
      "--write [new|replace|none]",
      "write output to disk instead of STDOUT",
      /new|replace|none/,
      "none"
    )
    .option("--delete-source", "delete the source file");

  program.parse(argv);

  if (program.args.length === 0) {
    program.outputHelp();
    process.exit(1);
  }

  const options = {
    inlineUtilityTypes: Boolean(program.inlineUtilityTypes),
    prettier: program.prettier,
    prettierOptions: {
      semi: Boolean(program.semi),
      singleQuote: Boolean(program.singleQuote),
      tabWidth: parseInt(program.tabWidth),
      trailingComma: program.trailingComma,
      bracketSpacing: Boolean(program.bracketSpacing),
      arrowParens: program.arrowParens,
      printWidth: parseInt(program.printWidth),
    },
  };

  if (options.prettier) {
    try {
      const prettierConfig = prettier.resolveConfig.sync(process.cwd());
      if (prettierConfig) {
        // @ts-ignore
        options.prettierOptions = prettierConfig;
      }
    } catch (e) {
      console.error("error parsing prettier config file");
      console.error(e);
      process.exit(1);
    }
  }

  const files = new Set<string>();
  for (const arg of program.args) {
    for (const file of glob.sync(arg)) {
      files.add(file);
    }
  }

  for (const file of files) {
    const inFile = file;
    const inCode = fs.readFileSync(inFile, "utf-8");

    if (program.keepUntyped && !inCode.startsWith("// @flow")) {
      console.log(`Skipping ${inFile} as it is not typed`);
      continue;
    }

    try {
      const outCode = convert(inCode, options);

      switch (program.write) {
        case "new": {
          const extension = detectJsx(inCode) ? ".tsx" : ".ts";
          const outFile = file.replace(/\.jsx?$/, extension);
          fs.writeFileSync(outFile, outCode);
          break;
        }
        case "replace": {
          const extension = detectJsx(inCode) ? ".tsx" : ".ts";
          const outFile = file.replace(/\.jsx?$/, extension);
          await _maybeMoveWithGit(inFile, outFile);
          fs.writeFileSync(outFile, outCode);
          break;
        }
        case "none":
        default:
          console.log(outCode);
          break;
      }

      if (program.deleteSource) {
        fs.unlinkSync(inFile);
      }
    } catch (e) {
      console.error(`error processing ${inFile}`);
      console.error(e);
    }
  }
};

async function _maybeMoveWithGit(from, to) {
  try {
    const git = simpleGit({ baseDir: process.cwd() });
    await git.mv(from, to);
  } catch (error) {
    fs.renameSync(from, to);
  }
}
