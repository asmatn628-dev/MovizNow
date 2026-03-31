import { openDB } from 'idb';

const DB_NAME = 'MovizNowCache';
const STORE_NAME = 'movieData';

const dbPromise = openDB(DB_NAME, 1, {
  upgrade(db) {
    db.createObjectStore(STORE_NAME);
  },
});

export const cacheData = async (key: string, data: any) => {
  // Explicitly exclude links
  const sanitizedData = { ...data };
  if (sanitizedData.link) delete sanitizedData.link;
  if (sanitizedData.streamUrl) delete sanitizedData.streamUrl;
  
  const db = await dbPromise;
  await db.put(STORE_NAME, sanitizedData, key);
};

export const getCachedData = async (key: string) => {
  const db = await dbPromise;
  return await db.get(STORE_NAME, key);
};
