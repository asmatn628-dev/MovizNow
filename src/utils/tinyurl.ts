export const generateTinyUrl = async (url: string): Promise<string> => {
  if (!url) return url;
  
  // If it's already a pixeldrain link, don't shorten it
  if (url.includes('pixeldrain.com') || url.includes('pixeldrain.dev')) {
    return url;
  }

  // If it's already a tinyurl, don't shorten it
  if (url.includes('tinyurl.com')) {
    return url;
  }

  try {
    // Generate a random 4-character alphanumeric string
    const randomChars = Math.random().toString(36).substring(2, 6);
    const alias = `03363284466${randomChars}`;
    
    const response = await fetch(`/api/tinyurl?url=${encodeURIComponent(url)}&alias=${alias}`);
    
    if (response.ok) {
      const shortUrl = await response.text();
      return shortUrl;
    } else {
      // If alias is taken or other error, try without alias or retry with new alias
      const retryResponse = await fetch(`/api/tinyurl?url=${encodeURIComponent(url)}`);
      if (retryResponse.ok) {
        return await retryResponse.text();
      }
    }
  } catch (error) {
    console.error("Error generating TinyURL:", error);
  }
  
  return url; // Fallback to original url
};
