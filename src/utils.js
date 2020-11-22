import admin from "firebase-admin";
import matter from "gray-matter";

/**
 * getApp: gets the app for the projectName
 */
export const getApp = async ({ authPath = false, projectName }) => {
  if (authPath) {
    // Get the Generated Private key from a secured file path
    return await import(authPath).then(({ default: serviceAccount }) => {
      // console.log(JSON.stringify(serviceAccount, null, 2));
      return admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: `https://${projectName}.firebaseio.com`,
      });
    });
  } else {
    // Create the Generated Private Key and store in GOOGLE_APPLICATION_CREDENTIALS
    // export GOOGLE_APPLICATION_CREDENTIALS="./service-account-file.json"
    // See: https://firebase.google.com/docs/admin/setup#initialize-sdk
    return await new Promise((resolve, reject) => {
      try {
        const app = admin.initializeApp({
          credential: admin.credential.applicationDefault(),
          databaseURL: `https://${projectName}.firebaseio.com`,
        });
        return resolve(app);
      } catch (e) {
        reject(e);
      }
    });
  }
};

/**
 * getMetaContent: Processes mdx with frontmatter to mdx with export meta
 */
export const getMetaContent = (mdxWithFrontmatter) => {
  const { data, content } = matter(mdxWithFrontmatter);
  return `export const meta = ${JSON.stringify(data, null, 2)}\n\n${content}`;
};

/**
 * getCollection: gets the files based on collection name
 */
export const getCollectionFiles = async (app, collection) => {
  if (!app || !app.firestore) {
    throw "Missing firebase database app (use getApp)";
  }
  const db = app.firestore();
  return db
    .collection(`${collection.name}`)
    .get()
    .then((returnQuery) => {
      const files = [];
      returnQuery.forEach((doc) => {
        const data = doc.data();
        let content = data.content.toString("utf-8");
        if (collection.isMeta) {
          content = getMetaContent(content);
        }
        files.push({
          id: doc.id,
          file: data.path || "",
          content,
        });
      });
      return files;
    })
    .catch((error) => {
      throw error;
    });
};
