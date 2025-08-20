import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import bodyParser from "body-parser";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

// ===== Middleware =====
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "10mb" }));
app.use(express.static("public"));

// ===== 1. Generate Story with OpenAI =====
app.post("/generate-story", async (req, res) => {
  try {
    const { location, playlist, photos, prompt: userPrompt, userLocation } = req.body;

    // Compose photo details
    let photoDetails = "No photo uploaded.";
    if (photos && photos.length > 0) {
      photoDetails = photos
        .map((p, i) => `Photo ${i + 1} named "${p.name}" showing: ${p.description}`)
        .join("\n");
    }

    // Playlist string
    let playlistStr = "no songs";
    if (playlist && playlist.length > 0) {
      playlistStr = playlist.join(", ");
    }

    // Current date
    const currentDate = new Date().toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    // Build prompt
    const prompt = userPrompt
      ? `Write a fun, lightly roasted diary story with lots of emojis in simple English, about 10 lines max. Based on this idea: "${userPrompt}". Keep it casual, witty, and entertaining. Use playful jokes and funny remarks. Do NOT add markdown like ** or __ anywhere.`
      : `Diary Entry: ${currentDate}
Location: ${location || userLocation || "unknown location"}
Spotify Playlist songs: ${playlistStr}
Uploaded photo(s):
${photoDetails}

Write a fun, lightly roasted diary story with lots of emojis in simple English, about 10 lines max. Keep it casual, witty, and entertaining. Use playful jokes and funny remarks. Do NOT add markdown like ** or __ anywhere.`;

    // Call OpenAI API
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 400,
        temperature: 0.8,
      }),
    });

    const data = await response.json();

    if (data.choices && data.choices.length > 0) {
      res.json({ story: data.choices[0].message.content });
    } else {
      console.error("OpenAI returned no choices:", data);
      res.status(500).json({ error: "No story generated" });
    }
  } catch (error) {
    console.error("OpenAI Error:", error);
    res.status(500).json({ error: "Failed to generate story" });
  }
});

// ===== 2. Spotify OAuth & API =====

// Spotify Login
app.get("/auth/spotify", (req, res) => {
  const scopes = ["playlist-read-private", "playlist-read-collaborative"].join(" ");
  const redirect_uri = encodeURIComponent(`${process.env.BASE_URL}/auth/spotify/callback`);
  res.redirect(
    `https://accounts.spotify.com/authorize?client_id=${process.env.SPOTIFY_CLIENT_ID}&response_type=code&redirect_uri=${redirect_uri}&scope=${encodeURIComponent(scopes)}`
  );
});

// Spotify Callback
app.get("/auth/spotify/callback", async (req, res) => {
  const code = req.query.code || null;
  if (!code) return res.status(400).send("No code provided");

  try {
    const authString = Buffer.from(
      `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
    ).toString("base64");

    const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${authString}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${process.env.BASE_URL}/auth/spotify/callback`,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.refresh_token) {
      console.log("Your Spotify Refresh Token:", tokenData.refresh_token);
    }

    res.send("Spotify authorization successful! Check console for refresh token.");
  } catch (error) {
    console.error("Spotify Callback Error:", error);
    res.status(500).json({ error: "Failed to get Spotify tokens" });
  }
});

// Refresh Spotify Token
async function getSpotifyAccessToken() {
  const authString = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString("base64");

  const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${authString}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: process.env.SPOTIFY_REFRESH_TOKEN,
    }),
  });

  const tokenData = await tokenResponse.json();

  if (tokenData.access_token) {
    return tokenData.access_token;
  } else {
    throw new Error("Could not refresh Spotify access token");
  }
}

// Fetch Spotify Playlist
app.get("/spotify-playlist", async (req, res) => {
  try {
    const accessToken = await getSpotifyAccessToken();
    const playlistId = process.env.SPOTIFY_PLAYLIST_ID;

    const playlistIdClean = playlistId.includes("playlist/")
      ? playlistId.split("playlist/")[1].split("?")[0]
      : playlistId;

    const playlistRes = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistIdClean}/tracks?limit=10`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const playlistData = await playlistRes.json();

    if (!playlistData.items) {
      return res.status(500).json({ error: "Invalid playlist data" });
    }

    const tracks = playlistData.items.map((item) => {
      const track = item.track;
      const artistNames = track.artists.map((a) => a.name).join(", ");
      return { name: track.name, artist: artistNames };
    });

    res.json({ tracks });
  } catch (error) {
    console.error("Spotify Playlist Error:", error);
    res.status(500).json({ error: "Failed to fetch Spotify playlist" });
  }
});

// ===== 3. Location Endpoint =====
app.post("/location", (req, res) => {
  const { latitude, longitude } = req.body;
  console.log(`Location received: lat=${latitude}, lon=${longitude}`);
  res.json({ status: "Location received" });
});

// ===== 4. Start Server =====
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`👉 Spotify authorize URL: ${process.env.BASE_URL}/auth/spotify`);
});
