const ytdl = require('ytdl-core');
const ytpl = require('ytpl');
const fs = require('fs');
const path = require('path');
const ProgressBar = require('progress');

const playlistUrls = [
  'https://www.youtube.com/watch?v=YOHopl2xPj0&list=PLWmVt_rgUljE8rhnsS8Hn70oAhwldkGi2',
];

const outputDirectory = './music';

// Function to sanitize the video title
function sanitizeTitle(title) {
  return title.replace(/[\/\\|:]/g, '_'); // Replace /, \, |, and : with underscores
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

          // Create a progress bar
          const progressBar = new ProgressBar(
            `${sanitizedTitle} [:bar] :percent Elapsed: :elapsed s - :speed/Mbs`,
            {
              complete: '=',
              incomplete: ' ',
              width: 20,
              total: totalBytes,
              clear: true, // Print on a new line for each song
              renderThrottle: 100, // Minimum time between updates in milliseconds
            }
          );

          let startTime = Date.now();

          // Download the audio stream and write to the file
          const fileStream = fs.createWriteStream(outputFilePath);
          audioStream.pipe(fileStream);

          let downloadedBytes = 0;

          audioStream.on('data', (chunk) => {
            downloadedBytes += chunk.length;
            const currentTime = Date.now();

            const elapsedSeconds = (currentTime - startTime) / 1000;

            const speed = downloadedBytes / elapsedSeconds / 1024; // Mb per second

            progressBar.tick(chunk.length, {
              elapsed: elapsedSeconds.toFixed(1),
              speed: speed.toFixed(2),
            });
          });

          fileStream.on('finish', () => {
            progressBar.terminate(); // Terminate the progress bar
            console.log(`\nDownload complete: ${sanitizedTitle}\n`);
            resolve(); // Resolve the promise when the download is complete
          });

          fileStream.on('error', (error) => {
            reject(error);
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

// Download each playlist in the array sequentially
async function downloadAllPlaylists(playlists, outputDirectory) {
  for (const playlistUrl of playlists) {
    await downloadPlaylistAudioWithRetry(playlistUrl, outputDirectory);
  }
}

// Replace 'YOUR_OUTPUT_DIRECTORY' with the desired output directory
downloadAllPlaylists(playlistUrls, outputDirectory);
