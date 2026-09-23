LyriCSED v2.0 - Correctif saut/seek stable

A remplacer sur GitHub :
- assets/js/app-v2.js
- version-v2.json

Ce correctif :
- n'envoie plus des dizaines de commandes SeekTo pendant le glissement de la barre ;
- envoie un seul saut lorsque l'utilisateur relache la barre ;
- empeche HorlogeAudio de remettre temporairement l'ancienne position juste apres un saut ;
- conserve les boutons +/-10 s, A/B et Mariho sur le meme AUDIO_SEEK ;
- ne change pas le volume ni le design.

Aucun nouveau bloc Kodular n'est necessaire si AUDIO_SEEK -> Lecteur1.Chercher a est deja present.
