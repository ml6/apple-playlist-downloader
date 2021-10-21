const fs = require("fs");
const request = require("request");
const ProgressBar = require("progress");
const axios = require("axios");
const NodeID3 = require("node-id3");
const itunesAPI = require("node-itunes-search");
const { exec } = require("child_process");
const minimist = require('minimist');

const INFO_URL = "https://slider.kz/vk_auth.php?q=";
const DOWNLOAD_URL = "https://slider.kz/download/";
let index = -1;
let songsList = [];
let total = 0;
let notFound = [];
let songsFound = [];
let lyricsFound = [];
let args = minimist(process.argv.slice(2), {
    default: {
        h: false,
        p: false
    },
});
if(args.h == true){
  console.log("HELP \n -h : Shows current message\n -p : Won't use python script to fetch lyrics. ");
  process.exit()
}
function get_lyrics (){
for (let songs of songsFound) {
  let artist1 = songs.artist;
  let songname1 = songs.songname;
  let album1 = songs.album;
      var split_artists = artist1.split(", "); // Separate differents artists : for Riton, Kah-Lo it will search for Riton, Kah-Lo - Riton - Kah-Lo
split_artists.splice(2, 0, artist1);
for (let i = 0; i < split_artists.length; i++) {
    exec("python3 searcher.py '"+split_artists[i]+"' '"+songname1+"' '"+artist1+"'", (error, stdout, stderr) => {
    if (error) {
        console.log(`error: ${error.message}`);
        return;
    }
    if (stderr) {
        console.log(`stderr: ${stderr}`);
        return;
    }
    if (`${stdout}` == 'LYRICS NOT FOUND\n'){
        //console.log('LYRICS NOT FOUND')
    }
    else{
        console.log('LYRICS FOUNDS FOR : ' + artist1 + ' - ' + songname1)
        //console.log(singers + ' - ' + songname + '.lrc')
        lyricsFound.push({
          songname: songname1,
          artist: artist1,
      });
        return;

    }

});
}

}
}
get_lyrics();
const download = async (song, url, song_name, singer_names, query_artwork) => {
  try {
    let numb = index + 1;
    console.log(`(${numb}/${total}) Starting download: ${song}`);
    const { data, headers } = await axios({
      method: "GET",
      url: url,
      responseType: "stream",
    });

    //for progress bar...
    const totalLength = headers["content-length"];
    const progressBar = new ProgressBar(
      "-> downloading [:bar] :percent :etas",
      {
        width: 40,
        complete: "=",
        incomplete: " ",
        renderThrottle: 1,
        total: parseInt(totalLength),
      }
    );

    data.on("data", (chunk) => progressBar.tick(chunk.length));
    data.on("end", () => {
      singer_names = singer_names.replace(/\s{2,10}/g, "");
      console.log("DOWNLOADED!");
      const filepath = `${__dirname}/songs/${song}.mp3`;
      //Replace all connectives by a simple ','
      singer_names = singer_names.replace(" and ", ", ");
      singer_names = singer_names.replace(" et ", ", ");
      singer_names = singer_names.replace(" und ", ", ");
      singer_names = singer_names.replace(" & ", ", ");
      //Search track informations using the Itunes library
      const searchOptions = new itunesAPI.ItunesSearchOptions({
        term: query_artwork, // All searches require a single string query.

        limit: 1, // An optional maximum number of returned results may be specified.
      });
      //Use the result to extract tags
      itunesAPI.searchItunes(searchOptions).then((result) => {
        try {
          // Get all the tags and cover art of the track using node-itunes-search and write them with node-id3
          let maxres = result.results[0]["artworkUrl100"].replace(
            "100x100",
            "3000x3000"
          );
          let year = result.results[0]["releaseDate"].substring(0, 4);
          let genre = result.results[0]["primaryGenreName"].replace(
            /\?|<|>|\*|"|:|\||\/|\\/g,
            ""
          );
          let trackNumber = result.results[0]["trackNumber"];
          let trackCount = result.results[0]["trackCount"];
          trackNumber = trackNumber + "/" + trackCount;
          let album = result.results[0]["collectionName"].replace(
            /\?|<|>|\*|"|:|\||\/|\\/g,
            ""
          );
          //console.log(genre);
          //console.log(year);
          //console.log(trackNumber);
          //console.log(album);
          //console.log(maxres);
          let query_artwork_file = query_artwork + ".jpg";
          download_artwork(maxres, query_artwork_file, function () {
            //console.log('Artwork downloaded');
            const tags = {
              TALB: album,
              title: song_name,
              artist: singer_names,
              APIC: query_artwork_file,
              year: year,
              trackNumber: trackNumber,
              genre: genre,
            };
            //console.log(tags);
            const success = NodeID3.write(tags, filepath);
            console.log("WRITTEN TAGS");
                    songsFound.push({
          songname: song_name,
          artist: singer_names,
      });
            try {
              fs.unlinkSync(query_artwork_file);
              //file removed
            } catch (err) {
              console.error(err);
            }
            startDownloading();
            //for next song!
          });
        } catch {
          console.log("Full tags not found for " + song_name);
          const tags = {
            title: song_name,
            artist: singer_names,
          };
          //console.log(tags);
          const success = NodeID3.write(tags, filepath);
          console.log("WRITTEN TAGS (Only artist name and track title)");
          songsFound.push({
          songname: song_name,
          artist: singer_names,
      });
          startDownloading();
        }
      });
    });

    //for saving in file...
    data.pipe(fs.createWriteStream(`${__dirname}/songs/${song}.mp3`));
  } catch {
    console.log("some error came!");
    startDownloading(); //for next song!
  }
};
var download_artwork = function (uri, filename, callback) {
  request.head(uri, function (err, res, body) {
    //console.log('content-type:', res.headers['content-type']);
    //console.log('content-length:', res.headers['content-length']);

    request(uri).pipe(fs.createWriteStream(filename)).on("close", callback);
  });
};
const getURL = async (song, singer, album) => {
  let query = (song + "%20" + singer).replace(/\s/g, "%20");
  // console.log(INFO_URL + query);
  const { data } = await axios.get(encodeURI(INFO_URL + query));

  // when no result then [{}] is returned so length is always 1, when 1 result then [{id:"",etc:""}]
  if (!data["audios"][""][0].id) {
    //no result
    console.log("==[ SONG NOT FOUND! ]== : " + song);
    notFound.push(song + " - " + singer);
    startDownloading();
    return;
  }

  //avoid remix,revisited,mix
  let i = 0;
  let track = data["audios"][""][i];
  while (/remix|revisited|mix/i.test(track.tit_art)) {
    i += 1;
    track = data["audios"][""][i];
  }
  //if reach the end then select the first song
  if (!track) {
    track = data["audios"][""][0];
  }

  if (fs.existsSync(__dirname + "/songs/" + track.tit_art + ".mp3")) {
    let numb = index + 1;
    console.log(
      "(" + numb + "/" + total + ") - Song already present!!!!! " + song
    );
    startDownloading(); //next song
    return;
  }
  
  let songName = track.tit_art.replace(/\?|<|>|\*|"|:|\||\/|\\/g, ""); //removing special characters which are not allowed in file name
  let link = DOWNLOAD_URL + track.id + "/";
  link = link + track.duration + "/";
  link = link + track.url + "/";
  link = link + songName + ".mp3" + "?extra=";
  link = link + track.extra;
  link = encodeURI(link); //to replace unescaped characters from link
  artwork_query = track.tit_art + ' ' + album;
  download(songName, link, song, singer, artwork_query);
};

const startDownloading = () => {
  index += 1;
  if (index === songsList.length) {
    console.log("\n#### ALL SONGS ARE DOWNLOADED!! ####\n");
    console.log("Songs that are not found:-");
    let i = 1;
    for (let song of notFound) {
      console.log(`${i} - ${song}`);
      i += 1;
    }
    if (i === 1) console.log("None!");
    if (args.p == false){
    console.log("SEARCHING FOR LYRICS...");
    get_lyrics();
    return;
  }
  if (args.p == true){
    console.log("LYRICS SEARCH DISABLE");
    return;
  }
  }
  let song = songsList[index].name;
  let singer = songsList[index].singer;
  let album = songsList[index].album;
  getURL(song, singer, album);
};

console.log("STARTING....");
let playlist = require("./apple_playlist");
playlist.getPlaylist().then((res) => {
  if (res === "Some Error") {
    //wrong url
    console.log(
      "Error: maybe the url you inserted is not of apple music playlist or check your connection!"
    );
    return;
  }
  songsList = res.songs;
  total = res.total;
  console.log("Total songs:" + total);

  //create folder
  let dir = __dirname + "/songs";
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
  }
  startDownloading();
});
