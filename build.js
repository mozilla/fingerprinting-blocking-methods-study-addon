/* eslint-env node */

const { promisify } = require("util");
const fs = require("fs");
const rimraf = promisify(require("rimraf"));
const klaw = require("klaw");
const pathModule = require("path");
const { template } = require("safe-es6-template");
const webExt = require("web-ext").default;

const packageJson = require("./package.json");

// A promisified version of the entire `fs` module.
const fsp = new Proxy(fs, {
  get(obj, prop) {
    return promisify(obj[prop]);
  },
});

// Read extension files from here
const SOURCE_DIR = "./src";
// Write processed extension files to here.
const DEST_BASE_DIR = "./dist";

/**
 * Copy the extension source from src into `dist/extension-${branch}`. Any
 * files whose name ends with `.tmpl` will be processed as templates and the
 * output will be saved to a file without the `.tmpl` extension.
 *
 * Templates use ES6 template string syntax. Available variables are `package`,
 * which contains the contents of `package.json` and `branch`, the parameter
 * passed to this function.
 *
 * @param {String} branch The branch of the extension to build. Used in file
 *        paths and provided to templates.
 */
async function copyAddonSrc({ branch }) {
  const version = packageJson.version;
  const targetDir = pathModule.join(
    DEST_BASE_DIR,
    `${packageJson.name.toLowerCase()}-${branch}-${version}`,
  );
  let templateData = {
    package: packageJson,
    branch: branch,
  };

  let filterBranch = item => {
    const pathData = pathModule.parse(item);
    let result = false;
    if ( pathData.base === "common" || pathData.dir.includes("common") ) {
      result = true;
    } else if ( pathData.base === branch || pathData.dir.includes(branch) ) {
      result = true;
    }
    return result;
  }

  await new Promise((resolve, reject) => {
    // Accrue promises of `data` callbacks, so we can await them before
    // resolving the parent promise.
    const promises = [];

    klaw(SOURCE_DIR, { filter: filterBranch })
      .on("data", ({ path, stats }) => {
        promises.push(
          (async () => {
            const pathData = pathModule.parse(path)
            let relativePath = pathModule.relative(SOURCE_DIR, path);
            if ( pathData.dir.includes(branch) ) {
              // Files in branch name folder get pulled to the top
              relativePath = pathModule.relative(
                pathModule.join(SOURCE_DIR, branch),
                path
              );
            }
            const targetPath = pathModule.join(targetDir, relativePath);

            if (stats.isDirectory()) {
              await fsp.mkdir(targetPath);
            } else if (stats.isFile()) {
              if (path.endsWith(".tmpl")) {
                const newPath = targetPath.replace(/\.tmpl$/, "");
                const content = await fsp.readFile(path, { encoding: "utf8" });
                const rendered = template(content, templateData);
                await fsp.writeFile(newPath, rendered);
              } else {
                await fsp.copyFile(path, targetPath);
              }
            } else {
              throw new Error(
                `Can't handle path at ${path} - neither file nor directory`,
              );
            }
          })(),
        );
      })
      .on("end", async () => {
        // Wait until all data callbacks are finished.
        await Promise.all(promises);
        resolve();
      })
      .on("error", (err, item) => {
        reject({ err, item });
      });
  });
}

/**
 * Calls web-ext to build the webextension from a built branch directory (see
 * copyAddonSrc). Then renames the file to a path that follows standard study
 * naming of `${id}@mozilla.org-${version}.xpi`, which includes the branch
 * name since `id` includes the branch name.
 *
 * @param {String} branch The branch of the extension to build. Used to find
 *        the source and name the final XPI file.
 */
async function buildAddon({ branch }) {
  const version = packageJson.version;
  const addonDir = pathModule.join(
    DEST_BASE_DIR,
    `${packageJson.name.toLowerCase()}-${branch}-${version}`,
  );
  await webExt.cmd.build(
    {
      sourceDir: addonDir,
      overwriteDest: true,
      artifactsDir: "web-ext-artifacts",
    },
    { shouldExitProgram: false },
  );
  const oldFilePath = pathModule.join(
    "web-ext-artifacts",
    `${packageJson.name.toLowerCase()}-${version}.zip`,
  );
  const newFilePath = pathModule.join(
    "web-ext-artifacts",
    `${packageJson.name.toLowerCase()}-${branch}@mozilla.org-${version}.xpi`,
  );
  await fsp.rename(oldFilePath, newFilePath);
  console.log(`Renamed ${oldFilePath} to ${newFilePath}`);
}

async function buildBranch(options) {
  await copyAddonSrc(options);
  await buildAddon(options);
}

async function main() {
  await rimraf(DEST_BASE_DIR);
  await fsp.mkdir(DEST_BASE_DIR);

  for (const branch of ["control", "treatmentScript"]) {
    await buildBranch({ branch });
  }
}

main().catch(err => console.error("Something has gone wrong", err));
