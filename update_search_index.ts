import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc } from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function update() {
  console.log("Fetching content...");
  const snapshot = await getDocs(collection(db, 'content'));
  const rawContent = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
  
  const searchIndex = rawContent.filter(c => c.status === 'published').map(c => {
    let seasons: any[] = [];
    if (c.seasons) {
      try {
        seasons = Array.isArray(c.seasons) ? c.seasons : JSON.parse(c.seasons);
      } catch (e) {}
    }
    const seasonsInfo = seasons.map(s => {
      const lastEp = s.episodes && s.episodes.length > 0 ? s.episodes[s.episodes.length - 1].episodeNumber : '';
      return `${s.seasonNumber}:${lastEp}`;
    }).join(',') || '';
    
    return `${c.id}|${c.title}|${c.year}|${c.posterUrl}|${c.type}|${c.qualityId || ''}|${c.languageIds?.join(',') || ''}|${c.genreIds?.join(',') || ''}|${c.createdAt}|${c.order ?? ''}|${seasonsInfo}`;
  });
  
  console.log("Updating search_index...");
  await setDoc(doc(db, 'metadata', 'search_index'), { data: searchIndex });
  console.log("Done!");
  process.exit(0);
}

update().catch(console.error);
