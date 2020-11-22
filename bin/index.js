#!/usr/bin/env node

/**
 * Copyright (c) 2020-present, ADARTA Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

"use strict";

import fs from "fs";
import path from "path";
// import admin from "firebase-admin";
import matter from "gray-matter";
// import Base64 from "js-base64";
import chalk from "chalk";
import boxen from "boxen";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { getApp, getMetaContent } from "../src/utils.js";

const ioError = chalk.bold.red;
const ioWarning = chalk.bold.yellow;
const ioSuccess = chalk.bold.green;

/**
 * Introduction
 */
const appdesc = chalk.yellow.bold(`CMS On Fire 🔥`);

console.log(
  boxen(appdesc, {
    padding: 1,
    margin: 1,
    borderStyle: "double",
    borderColor: "yellow",
    align: "center",
  })
);

/**
 * Command line argument handling
 */
const argv = yargs(hideBin(process.argv))
  .usage("Usage: $0 <command> <project name> [options]")
  .command(["import"], "import from firestore", (yargs) => {
    return yargs
      .example(
        "$0 $1 import my-project -k ./garden-key.json -o content -c ./src/NetlifyCMS/config.js -F",
        "import files from config collections (overwriting -F)"
      )
      .describe("o", "Output directory path")
      .alias("o", "outdir")
      .nargs("o", 1)
      .demandOption(["o"]);
  })
  .command("export", "export to firestore", (yargs) => {
    return yargs.example(
      "$0 export my-project -k ./garden-key.json -c ./src/NetlifyCMS/config.js -F",
      "export files to firestore collections"
    );
  })
  .alias("c", "config")
  .describe("c", "config directory path")
  .alias("m", "meta")
  .describe("m", "export meta rather than frontmatter")
  .alias("k", "authkey")
  .describe("k", "firebase private key")
  .alias("v", "verbose")
  .alias("F", "Force")
  .boolean(["v", "F"])
  .nargs("k", 1)
  .demandOption(["c"])
  .demandCommand(
    2,
    "You need a command (import|export) followed by project name"
  )
  .help("h")
  .alias("h", "help")
  .epilog("copyright 2020, ADARTA Inc.").argv;

function vlog(message) {
  if (argv.verbose) console.log(message);
}
vlog(JSON.stringify(argv, null, 2));

/**
 * Commands
 */
const cli = {
  export: (app, config) => {
    const indexData = config.backend.firebase.index_data || {};
    function processFile(filepath, filename, collectionName) {
      const content = fs.readFileSync(filepath);
      const raw = content.toString("base64");
      const fileArr = filename.split(".");
      const slug = fileArr.slice(0, fileArr.length - 1).join(".");
      const obj = {
        raw,
        slug,
        content,
      };
      // Decide whether data should be included in the file doc on firestore (beta)
      if (indexData[collectionName]) {
        switch (indexData[collectionName]) {
          case "json":
            obj.data = JSON.parse(content);
            break;
          case "md":
            obj.data = matter(content).data;
            break;
          case "mdx":
            obj.data = matter(content).data;
            break;
          default:
            // md
            obj.data = matter(content).data;
        }
      }
      return obj;
    }

    function isValidExtension(filePath) {
      const fArray = filePath.split(".");
      const extension = fArray[fArray.length - 1];
      return ["md", "mdx", "json", "yaml", "yml"].includes(extension);
    }

    async function processDir(dirPath) {
      // console.log("processing:", dirPath);
      const dir = await fs.promises.opendir(dirPath);
      const files = [];
      for await (const dirent of dir) {
        // console.log(dirent.name);
        if (isValidExtension(dirent.name))
          files.push({
            dirPath: path.join(dirPath, dirent.name),
            name: dirent.name,
          });
        // processFile(path.join(dirPath, dirent.name));
      }
      return files;
    }

    if (config && config.collections && app) {
      const db = app.firestore();
      // console.log(app.auth());
      config.collections.map((collection) => {
        // console.log(JSON.stringify(collection.name, null, 2));
        if (collection.folder) {
          const collectionName = collection.name;
          const collectionFolder = collection.folder;
          const go = async () => {
            const files = await processDir(
              path.join(process.cwd(), collectionFolder),
              collectionFolder
            );
            // console.log(files.length);
            files.map((file) => {
              const id = `${collectionFolder.replace(/\//g, "___")}___${
                file.name
              }`;
              const info = processFile(file.dirPath, file.name, collectionName);
              info.path = `${collectionFolder}/${file.name}`;
              // console.log(`${collectionName}_file:`, info.slug, info.path);
              // write record onto id
              db.doc(`${collectionName}/${id}`)
                .get()
                .then((doc) => {
                  if (doc.exists) {
                    return doc.ref
                      .update(info)
                      .then((returnQuery) => {
                        vlog(ioSuccess(`✔ Created: ${collectionName}/${id}`));
                      })
                      .catch((error) => {
                        console.log(
                          ioError(`✗ Error: ${collectionName}/${id}`),
                          error.message
                        );
                      });
                  } else {
                    return doc.ref
                      .set(info)
                      .then((returnQuery) => {
                        vlog(ioSuccess(`✔ Updated: ${collectionName}/${id}`));
                      })
                      .catch((error) => {
                        console.log(
                          ioError(`✗ Error: ${collectionName}/${id}`),
                          error.message
                        );
                      });
                  }
                })
                .catch((error) => {
                  console.log(
                    ioError(`✗ Error: ${collectionName}/${id}`),
                    error.message
                  );
                });
            });
          };
          go();
        } else {
          collection.files.map((item) => {
            // console.log("file:", item.file);
            const collectionName = collection.name;
            const dirPath = path.join(process.cwd(), item.file);
            const fileArr = item.file.split("/");
            const fileName = fileArr.slice(
              fileArr.length - 1,
              fileArr.length
            )[0];
            const id = `${item.file.replace(/\//g, "___")}`;
            const info = processFile(dirPath, fileName, collectionName);
            info.path = item.file;
            // console.log(`${collectionName}_file:`, info.slug, info.path);
            // write record onto id
            db.doc(`${collectionName}/${id}`)
              .get()
              .then((doc) => {
                if (doc.exists) {
                  return doc.ref
                    .update(info)
                    .then((returnQuery) => {
                      vlog(ioSuccess(`✔ Updated:`), `${collectionName}/${id}`);
                    })
                    .catch((error) => {
                      console.log(
                        `Error: ${collectionName}/${id}`,
                        error.message
                      );
                    });
                } else {
                  return doc.ref
                    .set(info)
                    .then((returnQuery) => {
                      vlog(ioSuccess(`✔ Created:`), `${collectionName}/${id}`);
                    })
                    .catch((error) => {
                      console.log(
                        `Error: ${collectionName}/${id}`,
                        error.message
                      );
                    });
                }
              })
              .catch((error) => {
                console.log(
                  ioWarning(`⚠ Error: ${collectionName}/${id}`),
                  error.message
                );
              });
          });
        }
      });
    }
    return ioSuccess("Finishing (export)!");
  },
  import: (app, config) => {
    if (!argv.outdir) {
      console.log(
        ioError(`✗ Missing directory path (--outdir, -o) from command.`)
      );
      return;
    }

    const outputPath = path.join(process.cwd(), argv.outdir);
    const exists = fs.existsSync(outputPath);
    vlog(ioSuccess(`✔ [${exists}] ${outputPath}`));
    if (!exists && !argv.Force) {
      console.log(ioError(`✗ Directory ${outputPath} doesn't exist.`));
      throw "Missing";
    }
    if (!exists) {
      fs.mkdirSync(outputPath, { recursive: true });
      vlog(ioSuccess(`✔ Forced create: ${outputPath}`));
    }

    if (config && config.collections && app) {
      const db = app.firestore();
      // console.log(app.auth());
      const processed = config.collections.map((collection) => {
        if (collection.folder) {
          // Process directory location for the folder collection
          const collectionPath = path.join(outputPath, collection.folder);
          const exists = fs.existsSync(collectionPath);
          if (!exists && !argv.Force) {
            console.log(
              ioError(
                `✗ collection folder directory ${collectionPath} doesn't exist.`
              )
            );
            throw "Missing";
          }
          if (!exists) {
            fs.mkdirSync(collectionPath, { recursive: true });
            vlog(ioSuccess(`✔ Forced create: ${collectionPath}`));
          }
          // get the entries by Folder (collection name)
          db.collection(`${collection.name}`)
            .get()
            .then((returnQuery) => {
              returnQuery.forEach((doc) => {
                const data = doc.data();
                const dbItem = {
                  file: data.path || "",
                  content: data.content,
                  // content: data.raw
                  //   ? Buffer.from(data.raw, "base64").toString("utf-8")
                  //   : "",
                };
                // Write out the file (checking Force)
                if (!dbItem.file) throw `Missing file path for ${doc.id}`;
                const documentPath = path.join(outputPath, dbItem.file);
                const exists = fs.existsSync(documentPath);
                if (exists && !argv.Force) {
                  console.log(
                    ioWarning(
                      `⚠ collection file ${documentPath} already exists.`
                    )
                  );
                } else {
                  // Write out our file into the folder
                  const content =
                    argv.meta &&
                    collection.extension &&
                    collection.extension === "mdx"
                      ? getMetaContent(dbItem.content.toString("utf-8"))
                      : dbItem.content;
                  fs.writeFileSync(documentPath, content);
                  vlog(
                    ioSuccess(
                      `✔ ${exists ? "Overwrote" : "Created"}: ${documentPath}`
                    )
                  );
                }
              });
            })
            .catch((error) => {
              throw error;
            });
        } else {
          collection.files.map((item) => {
            /* Check folder first for the file */
            const dirArr = item.file.split("/");
            const folder =
              dirArr.length > 1
                ? dirArr.slice(0, dirArr.length - 1).join("/")
                : "";
            const dirPath = path.join(outputPath, folder);
            const dirExists = fs.existsSync(dirPath);
            if (!dirExists && !argv.Force) {
              console.log(
                ioError(
                  `✗ collection folder directory ${dirPath} doesn't exist.`
                )
              );
              throw "Missing";
            }
            if (!dirExists) {
              fs.mkdirSync(dirPath, { recursive: true });
              vlog(ioSuccess(`✔ Forced create: ${dirPath}`));
            }
            /* Check for the file */
            const filePath = path.join(outputPath, item.file);
            const fileExists = fs.existsSync(filePath);
            const documentId = `${collection.name}/${item.file.replace(
              /\//g,
              "___"
            )}`;
            if (fileExists && !argv.Force) {
              console.log(ioWarning(`⚠ File ${filePath} already exists.`));
            } else {
              // Get file from firestore
              db.doc(`${documentId}`)
                .get()
                .then((doc) => {
                  // If doc doesn't exist return a new file object
                  if (!doc.exists)
                    throw `✗ File ${documentId} Didn't exist in firestore.`;
                  const data = doc.data();
                  // ? Buffer.from(data.raw, "base64").toString("utf-8")
                  // : "";
                  if (data.path !== item.file)
                    throw `✗ config file path ${item.file} doesn't match firestore ${data.path}.`;
                  // Write out our file into the folder
                  const content =
                    argv.meta && item.extension && item.extension === "mdx"
                      ? getMetaContent(data.content.toString("utf-8"))
                      : data.content;

                  fs.writeFileSync(filePath, content);
                  vlog(
                    ioSuccess(
                      `✔ ${exists ? "Overwrote" : "Created"}: ${filePath}`
                    )
                  );
                })
                .catch((error) => {
                  console.log(ioError(`✗ ${error.message}`));
                  process.exit(1);
                });
            }
          });
        }
        return collection.name;

        // fs.mkdirSync(createPath);
      });
      return ioSuccess("Finishing (import)!", processed);
    }
  },
};

/**
 * CLI Runner
 */
/**
 * Get the config file
 */
if (!argv.config) {
  console.log(ioError(`✗ Missing config file (--config, -c) from command.`));
  throw "error";
}

const configPath = path.join(process.cwd(), argv.config);
const configExists = fs.existsSync(configPath);
vlog(ioSuccess(`✔ [${configExists}] ${configPath}`));
if (!configExists) {
  console.log(ioError(`✗ Config file ${configPath} doesn't exist.`));
  throw "error";
}

import(configPath).then(({ default: config }) => {
  // console.log(JSON.stringify(cmsConfig, null, 2));

  const authPath = argv.authkey && path.join(process.cwd(), argv.authkey);
  if (!argv.authkey && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.log(
      ioError(
        `✗ Missing auth key file (--authkey, -k) from command OR env.GOOGLE_APPLICATION_CREDENTIALS
You can store the path in the environment variable GOOGLE_APPLICATION_CREDENTIALS
export GOOGLE_APPLICATION_CREDENTIALS="./service-account-file.js"
or
pass the file path via this cli (--authkey, -k) using a relative path 
cmsonfire <import|export> <app-name-id> -k ./service-account-file.js ...

Recommended configuration is to store the credentials in an environment variable as a json string, then use a file configuration like below to parse the json rather than store the credentials in a repository or storage location.

./service-account-file.js
01 const config = JSON.parse(process.env.GOOGLE_APPLICATION_ADMIN);
02 export default config;
`
      )
    );
    process.exit(1);
  }
  const projectName = argv._[1];
  if (!projectName) {
    console.log(ioError(`✗ Missing project name following command.`));
    process.exit(1);
  }

  getApp({ authPath, projectName }).then((app) => {
    // TODO: rather than force this to be a file path, get from process.env.GOOGLE_APPLICATION_CREDENTIALS instead
    // import(authPath).then(({ default: serviceAccount }) => {
    //   // console.log(JSON.stringify(serviceAccount, null, 2));
    //   const app = admin.initializeApp({
    //     credential: admin.credential.cert(serviceAccount),
    //     databaseURL: `https://${projectName}.firebaseio.com`,
    //   });
    //   // OR:
    //   // Create the Generated Private Key and store in GOOGLE_APPLICATION_CREDENTIALS
    //   // export GOOGLE_APPLICATION_CREDENTIALS="./service-account-file.json"
    //   // See: https://firebase.google.com/docs/admin/setup#initialize-sdk
    //   // const app = admin.initializeApp({
    //   //   credential: admin.credential.applicationDefault(),
    //   //   databaseURL: `https://${projectName}.firebaseio.com`,
    //   // });

    try {
      const command = argv._[0];
      if (command === "export") {
        console.log(cli.export(app, config));
      } else {
        console.log(cli.import(app, config));
      }
    } catch (e) {
      console.error(ioError(e));
    }
  });
});
