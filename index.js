const fs = require('fs');
const yargs = require('yargs');
const ytdl = require('ytdl-core');
const ytpl = require('ytpl');
const path = require('path');

// Parse command line arguments
const argv = yargs
  .option('input', {
    alias: 'i',
    describe: 'Input file containing playlist URLs (each URL on a new line)',
    demandOption: true,
    type: 'string',
  })
  .option('outdir', {
    alias: 'o',
    describe: 'Output directory for downloaded music',
    demandOption: true,
    type: 'string',
  }).argv;

const inputFilePath = argv.input;
const outputDirectory = argv.outdir;

// Function to sanitize the video title
function sanitizeTitle(title) {
  // Replace special characters with underscores
  return title.replace(/[\/\\|:?"<>*]/g, '_');
}

async function downloadVideoWithRetry(video, outputDirectory, retryCount = 3) {
  return new Promise(async (resolve, reject) => {
    const sanitizedTitle = sanitizeTitle(video.title);
    const outputFilePath = path.join(outputDirectory, `${sanitizedTitle}.mp3`);

    // Check if the file already exists, skip download if it does
    if (fs.existsSync(outputFilePath)) {
      console.log(`Skipping download for existing file: ${sanitizedTitle}`);
      resolve();
      return;
    }

    let downloadAttempt = 1;

    while (downloadAttempt <= retryCount) {
      console.log(`Downloading ${sanitizedTitle} (Attempt ${downloadAttempt})`);

      try {
        // Get the highest resolution audio stream
        const audioStream = ytdl(video.url, { filter: 'audioonly' });
        let totalBytes = 0;

        audioStream.on('response', (res) => {
          totalBytes = parseInt(res.headers['content-length'], 10);

          let startTime = Date.now();
          let lastLoggedPercentage = -1;

          // Download the audio stream and write to the file
          const fileStream = fs.createWriteStream(outputFilePath);
          audioStream.pipe(fileStream);

          let downloadedBytes = 0;

          audioStream.on('data', (chunk) => {
            downloadedBytes += chunk.length;
            const currentTime = Date.now();

            const elapsedSeconds = (currentTime - startTime) / 1000;

            const speed = downloadedBytes / elapsedSeconds / 1024; // Mb per second

            const percentage = (downloadedBytes / totalBytes) * 100;

            // Log progress only if the percentage has changed
            if (Math.floor(percentage) !== lastLoggedPercentage) {
              lastLoggedPercentage = Math.floor(percentage);
              console.clear();
              console.log(
                `${sanitizedTitle} [${'='.repeat(
                  Math.floor(percentage / 2)
                )}>${' '.repeat(
                  50 - Math.floor(percentage / 2)
                )}] ${percentage.toFixed(2)}% Elapsed: ${elapsedSeconds.toFixed(
                  1
                )} s - ${speed.toFixed(2)} Mbs`
              );
            }
          });

          fileStream.on('finish', () => {
            console.clear();
            console.log(`Download complete: ${sanitizedTitle}\n`);
            resolve(); // Resolve the promise when the download is complete
          });
        });

        audioStream.on('error', (error) => {
          reject(error);
        });

        return; // Exit the function after starting the download
      } catch (error) {
        if (
          error.message.includes('read ECONNRESET') ||
          error.message.includes('getaddrinfo ENOTFOUND')
        ) {
          console.error(
            `Connection error during download of ${sanitizedTitle}: ${error.message}`
          );
          console.log(
            `Retrying ${sanitizedTitle} (Attempt ${downloadAttempt + 1})`
          );
        } else {
          console.error(
            `Error during download of ${sanitizedTitle}: ${error.message}`
          );
          if (downloadAttempt < retryCount) {
            console.log(
              `Retrying ${sanitizedTitle} (Attempt ${downloadAttempt + 1})`
            );
          } else {
            console.log(
              `Max retry attempts reached for ${sanitizedTitle}. Moving on to the next item.`
            );
            resolve(); // Resolve the promise even if max retries are reached
          }
        }
      }

      downloadAttempt += 1;
    }
  });
}

async function downloadPlaylistAudioWithRetry(playlistUrl, outputDirectory) {
  const playlistInfo = await ytpl(playlistUrl);

  // Create the output directory if it doesn't exist
  if (!fs.existsSync(outputDirectory)) {
    fs.mkdirSync(outputDirectory, { recursive: true });
  }

  // Download each video in the playlist sequentially
  for (const video of playlistInfo.items) {
    try {
      await downloadVideoWithRetry(video, outputDirectory);
    } catch (error) {
      console.error(
        `Error during download of ${video.title}: ${error.message}`
      );
    }
  }
}

async function downloadAllPlaylistsFromFile(inputFilePath, outputDirectory) {
  const playlistUrls = [];

  // Read the playlist URLs from the input file
  const data = fs.readFileSync(inputFilePath, 'utf-8');
  const lines = data.split(/\r?\n/);

  for (const line of lines) {
    playlistUrls.push(line);
  }

  // Download each playlist in the array sequentially
  for (const playlistUrl of playlistUrls) {
    await downloadPlaylistAudioWithRetry(playlistUrl, outputDirectory);
  }
}

// Replace 'YOUR_OUTPUT_DIRECTORY' with the desired output directory
downloadAllPlaylistsFromFile(inputFilePath, outputDirectory);
