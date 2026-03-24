const formatRuntime = (runtime: string): string => {
  if (!runtime) return '';
  const minMatch = runtime.match(/(\d+)/);
  const totalMin = minMatch ? parseInt(minMatch[1]) : 0;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return `${hours}h:${mins.toString().padStart(2, '0')}m`;
};

// Assume 'content' is the movie or series object passed into the function
const executeShare = (content) => {
  // Existing code...

  // Print Quality
  let output = `Print Quality: ${quality}`;

  // Adding runtime if exists
  if (content.runtime) {
    output += `\n⏱️ Runtime: ${formatRuntime(content.runtime)}`;
  }

  // Adding release date if exists
  if (content.releaseDate) {
    output += `\n📅 Release Date: ${content.releaseDate}`;
  }

  // Format download links
  let downloadLinks = "📥 *Download Links:*\n";
  content.downloadLinks.forEach(({quality, size, url}) => {
    downloadLinks += `▪️ ${quality} (${size})\n${url}\n`;
  });
  output += `\n${downloadLinks}`;

  // For series, iterate over seasons
  if (content.isSeries) {
    content.seasons.forEach(season => {
      season.downloadLinks.forEach(({quality, size, url}) => {
        output += `\n📥 *Download Links (Season ${season.number}):*\n▪️ ${quality} (${size})\n${url}`;
      });
    });
  }

  // Remaining part of shared message...
};

