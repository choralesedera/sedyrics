# AUDIT LyriCSED v8

Base technique : LyriCSED Premium v6 Liturgie-Concert (dernière version complète validée).

## Sources Lyrics vérifiées
- Lyrics SEDERA.txt : 12 chansons détectées.
- Lyrics SEDERA 2.txt : 10 chansons détectées.
- Doublons entre les deux : Ho avy ny Tomponao, Zanaka Adala.
- Pour ces doublons, le texte de Lyrics SEDERA 2.txt est utilisé comme version la plus récente.
- Ho mpanomponao reste le même chant existant, avec les paroles du fichier Lyrics SEDERA.txt.

## Catalogue final
- 28 chansons au total.
- 25 chansons avec Lyrics.
- 18 chansons avec Playback.
- 1 chanson avec Solfa.
- 3 chansons Playback sans Lyrics : Andao hibebaka, Mitsangana, Tsy misy olana.
- 10 chansons Lyrics sans Playback : Famonjena ho ahy, Ho avy ny Tomponao, Ô! Iraho Jeso, Zanaka Adala, Getsemane, SEDERA O, FITIAVAN’I JESOSY, Ny alin'ny getsemane, Inona no havalinao, NATOLOTRAO HO AVOTRAY.

## Playback GitHub pris en compte
- Mino Anao aho -> instrumentals/mino-anao-instrumental.mp3
- Ry Fanahy Masina -> instrumentals/ry-fanahy-masina-instrumental.mp3
- Noho ny helokao -> instrumentals/noho-ny-helokao-instrumental.mp3
- Ho mpanomponao -> instrumentals/ho-mpanomponao-instrumental.mp3
- Zanahary o tahio -> instrumentals/zanahary-o-tahio-instrumental.mp3
- ANAO NY DERA -> instrumentals/anao-ny-dera-instrumental.mp3
- Andriamanitra o, henoy -> instrumentals/andriamanitra-o-henoy.mp3
- Inona kosa -> instrumentals/inona-kosa-instrumental.mp3
- Intoy rolahy -> instrumentals/intoy-rolahy-instrumental.mp3
- Lovasoa -> instrumentals/lovasoa-instrumental.mp3
- Mbola tsara -> instrumentals/mbola-tsara-instrumental.mp3
- Miandry anao -> instrumentals/miandry-anao-instrumental.wma
- Mpandresy -> instrumentals/mpandresy-instrumental.mp3
- Jesosy mandigny anao -> instrumentals/Jesosy-mandigny-anao-instrumental.mp3
- Tsy mba vola -> instrumentals/tsy-mba-vola-instrumental.mp3
- Andao hibebaka -> instrumentals/andao-hibebaka-instrumental.mp3
- Mitsangana -> instrumentals/mitsangana-instrumental.mp3
- Tsy misy olana -> instrumentals/Tsy-misy-olana_instrumental.mp3

## Fonctionnalités conservées / restaurées
- Header fixe de la v6.
- Indicateur compact de playback dans le header.
- Indicateur corrigé pour les playbacks d'une chanson ET les playlists Liturgie/Concert.
- Lecteur avancé de chanson, répétition A/B, repères supprimables, notes autosauvegardées.
- Liturgie et Planning Concert séparés, dernier design v6 conservé.
- Lecteur événementiel compact placé au-dessus des playlists.
- Prochain playback, morceaux suivants, délai global/individuel et compte à rebours conservés.
- Offline First et mise à jour atomique conservés.
- Zoom HTML - / 100% / + ajouté pour Lyrics et Solfa.
- À propos : Ankino MG lié à https://www.ankino.com/.
- Pages Facebook affichées avec leur nom, mais aucun lien n'a été inventé car aucune URL officielle n'était présente dans les fichiers fournis.

## Remarque format audio
Miandry anao utilise encore un fichier WMA. Le fichier est référencé, mais un MP3 reste préférable pour Android WebView.
