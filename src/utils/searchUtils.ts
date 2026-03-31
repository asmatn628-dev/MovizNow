export const levenshteinDistance = (a: string, b: string): number => {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          Math.min(
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1 // deletion
          )
        );
      }
    }
  }

  return matrix[b.length][a.length];
};

export const isFuzzyMatch = (searchWord: string, targetWord: string, maxErrors: number = 3): boolean => {
  if (searchWord.length === 0) return false;
  
  // Exact or substring match is always true
  if (targetWord.includes(searchWord)) return true;

  // If search word is very short, require exact match or prefix match
  if (searchWord.length <= 2) {
    return targetWord.startsWith(searchWord);
  }

  // Check Levenshtein distance
  const distance = levenshteinDistance(searchWord, targetWord);
  
  // Allow more errors for longer words
  const allowedErrors = Math.min(maxErrors, Math.floor(searchWord.length / 2));
  
  return distance <= allowedErrors;
};

export const smartSearch = <T extends { title: string }>(
  items: T[],
  query: string,
  maxErrors: number = 3
): T[] => {
  if (!query.trim()) return [];

  const searchWords = query.toLowerCase().split(/[\s\-:]+/).filter(w => w.length > 0);
  if (searchWords.length === 0) return [];

  return items.filter(item => {
    const titleWords = item.title.toLowerCase().split(/[\s\-:]+/).filter(w => w.length > 0);
    
    // For each search word, check if it fuzzy matches ANY word in the title
    return searchWords.some(searchWord => {
      return titleWords.some(titleWord => isFuzzyMatch(searchWord, titleWord, maxErrors));
    });
  });
};
