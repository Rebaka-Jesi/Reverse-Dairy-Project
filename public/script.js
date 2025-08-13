document.addEventListener("DOMContentLoaded", () => {
  const locationBtn = document.getElementById("getLocationBtn");
  const spotifyBtn = document.getElementById("getSpotifyBtn");
  const uploadInput = document.getElementById("photoUploader");
  const storyContainer = document.getElementById("storyContainer");
  const spotifyOutput = document.getElementById("spotifyOutput");
  const locationStatus = document.getElementById("locationStatus");

  let userLocation = "";
  let playlistSongs = [];
  let uploadedImages = [];

  // Mock image recognition function
  async function recognizeImage(base64Image) {
    return ["a sunny beach", "palm trees", "blue sky"];
  }

  // ===== 1. Send Location =====
  locationBtn.addEventListener("click", () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;

          try {
            await fetch("/location", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ latitude: lat, longitude: lon }),
            });
            locationStatus.textContent = "Location sent successfully!";
          } catch {
            locationStatus.textContent = "Failed to send location.";
          }

          try {
            const res = await fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`
            );
            const data = await res.json();
            userLocation = data.display_name || `${lat}, ${lon}`;
            const confirmLoc = prompt(
              `Is this your correct location?\n${userLocation}\nIf not, enter manually:`,
              userLocation
            );
            if (confirmLoc && confirmLoc.trim() !== "")
              userLocation = confirmLoc.trim();
            alert(`Location set to: ${userLocation}`);
          } catch {
            userLocation = `${lat}, ${lon}`;
            alert(`Location set to: ${userLocation}`);
          }
        },
        (error) => {
          switch (error.code) {
            case error.PERMISSION_DENIED:
              alert("Location permission denied. Please allow access.");
              break;
            case error.POSITION_UNAVAILABLE:
              alert("Location unavailable. Try again in a clear area.");
              break;
            case error.TIMEOUT:
              alert("Location request timed out. Try again.");
              break;
            default:
              alert("Unable to get location.");
          }
          console.error(error);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    } else {
      alert("Geolocation is not supported by your browser.");
    }
  });

  // ===== 2. Fetch Spotify Playlist =====
  spotifyBtn.addEventListener("click", async () => {
    try {
      const res = await fetch("/spotify-playlist");
      const data = await res.json();
      if (data.tracks && data.tracks.length > 0) {
        playlistSongs = data.tracks.map(
          (track) => `${track.name} by ${track.artist}`
        );
        spotifyOutput.textContent = playlistSongs.join("\n");
        alert(`Fetched ${playlistSongs.length} songs from your playlist`);
      } else {
        alert("No songs found in playlist.");
        spotifyOutput.textContent = "";
      }
    } catch (err) {
      alert("Error fetching playlist.");
      spotifyOutput.textContent = "";
      console.error(err);
    }
  });

  // ===== 3. Upload Photo =====
  uploadInput.addEventListener("change", async (event) => {
    const files = Array.from(event.target.files);
    if (!files.length) return;

    const previewDiv = document.getElementById("photoUploadPreview");
    previewDiv.innerHTML = "";
    uploadedImages = [];

    const readPromises = files.map(
      (file) =>
        new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = async () => {
            const base64 = reader.result;
            const img = document.createElement("img");
            img.src = base64;
            img.style.height = "100px";
            img.style.marginRight = "10px";
            img.style.marginBottom = "10px";
            previewDiv.appendChild(img);

            const descriptionArray = await recognizeImage(base64);
            uploadedImages.push({
              name: file.name,
              base64,
              description: descriptionArray.join(", "),
            });
            resolve();
          };
          reader.readAsDataURL(file);
        })
    );

    await Promise.all(readPromises);
    alert("Photo(s) uploaded successfully and recognition started!");
  });

  // ===== 4. Generate Story =====
  document.getElementById("generateStoryBtn").addEventListener("click", async () => {
    const userPrompt = document.getElementById("storyPrompt").value.trim();

    if (!userLocation && playlistSongs.length === 0 && uploadedImages.length === 0 && !userPrompt) {
      alert("Please provide location, playlist, photo, or write a story idea.");
      return;
    }

    let photoInfo = "No photo uploaded.";
    if (uploadedImages.length > 0) {
      photoInfo = uploadedImages
        .map(
          (img, i) =>
            `Photo ${i + 1} named "${img.name}" showing: ${img.description}`
        )
        .join("\n");
    }

    let prompt = userPrompt
      ? `Write a fun, lightly roasted diary story with lots of emojis in simple English, about 10 lines max. Based on this idea: "${userPrompt}". Keep it casual, witty, and entertaining. Use playful jokes and funny remarks.`
      : `Write a fun, lightly roasted diary story with lots of emojis in simple English, about 10 lines max, incorporating these details:
- Location: ${userLocation || "unknown location"}
- Spotify Playlist songs: ${playlistSongs.length > 0 ? playlistSongs.join(", ") : "no songs"}
- Uploaded photo(s):\n${photoInfo}
Keep it casual, witty, and entertaining. Use playful jokes and funny remarks.`;

    try {
      const res = await fetch("/generate-story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location: userLocation,
          playlist: playlistSongs,
          photos: uploadedImages,
          prompt: prompt,
        }),
      });

      const data = await res.json();

      if (data.story) {
        storyContainer.innerHTML = `
          <h3>Your Story</h3>
          <p>${data.story.replace(/\n/g, "<br>")}</p>
          <button id="saveStoryBtn" class="btn">Save Story</button>
        `;

        document.getElementById("saveStoryBtn").addEventListener("click", () => {
          const savedStoriesDiv = document.getElementById("savedStories");
          const now = new Date();

          // 12-hour time format
          let hours = now.getHours();
          const minutes = now.getMinutes();
          const seconds = now.getSeconds();
          const ampm = hours >= 12 ? "PM" : "AM";
          hours = hours % 12;
          hours = hours ? hours : 12;
          const formattedTime = `${hours.toString().padStart(2,'0')}:${minutes.toString().padStart(2,'0')}:${seconds.toString().padStart(2,'0')} ${ampm}`;
          const dateStr = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()}, ${formattedTime}`;

          const storyDiv = document.createElement("div");
          storyDiv.classList.add("savedStory");
          storyDiv.style.padding = "10px";
          storyDiv.style.marginBottom = "10px";
          storyDiv.style.background = "linear-gradient(45deg, #00b09b, #96c93d)"; // matches button
          storyDiv.style.borderRadius = "10px";
          storyDiv.style.color = "#fff"; // readable text on gradient
          storyDiv.innerHTML = `
            <strong>${dateStr}</strong>
            <p>${data.story.replace(/\n/g, "<br>")}</p>
          `;

          savedStoriesDiv.prepend(storyDiv);
          alert("Story saved!");
        });
      } else {
        storyContainer.innerHTML = `<p style="color:red;">Error: ${data.error || "Story could not be generated."}</p>`;
      }
    } catch (error) {
      storyContainer.innerHTML = `<p style="color:red;">Error: Failed to fetch story.</p>`;
      console.error(error);
    }
  });
});
