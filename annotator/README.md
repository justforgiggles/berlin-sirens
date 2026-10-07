# Siren annotation

Run locally in desktop Chrome or Edge:

```sh
cd annotator
npm install
npm run dev
```

Open the localhost address printed by Vite. Select one or more audio files from `data/audio/`, play a recording, and seek by clicking the waveform. Adjust the two range handles or set either end to the playhead, choose a label, and add the range. The next unlabeled span is selected automatically. Ranges may touch but cannot overlap; any time left unmarked stays unlabeled. Use **Save JSON** to choose a local output file, then use it again to write further changes. **Open JSON** resumes a saved review; reselect the corresponding audio files to play them. Files are matched by name, size, and modification time.

The browser reads audio locally. Video files are rejected. The WAV recordings converted from the project videos are already in `data/audio/`.
Their `recording-###_...wav` names summarize the siren labels; `data/siren-annotations.json` holds the precise ranges and original filenames.

The app writes a standalone, versioned JSON export. It does not change the Python training pipeline. `npm test` checks range validation; `npm run build` checks the app.
