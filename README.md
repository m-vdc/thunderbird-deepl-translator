# DeepL Translator for Thunderbird

Extension Thunderbird qui permet de traduire du texte sélectionné dans les emails vers le français en utilisant l'API DeepL.

## Fonctionnalités

- 🔤 **Traduction vers le français** via l'API DeepL (Free ou Pro)
- 🖱️ **Menu contextuel** : clic droit sur le texte sélectionné → "Traduire en français (DeepL)"
- ⌨️ **Raccourci clavier** : `Ctrl+Shift+T` (Windows/Linux) / `Cmd+Shift+T` (Mac)
- 📋 **Copie de la traduction** dans le presse-papiers
- ✏️ **Remplacement** du texte sélectionné (dans une fenêtre de composition)
- 🔔 **Notifications** avec la traduction
- ⚙️ **Configuration** de la clé API DeepL (Free ou Pro)

## Installation

1. Téléchargez le fichier `deepl-translator-v1.0.0.xpi`
2. Ouvrez Thunderbird
3. Allez dans **Outils > Modules complémentaires et thèmes** (ou `Ctrl+Shift+A`)
4. Cliquez sur l'icône d'engrenage ⚙️ > **Installer un module depuis un fichier...**
5. Sélectionnez le fichier `.xpi`
6. Confirmez l'installation

## Configuration

1. Après installation, cliquez sur l'icône de l'extension dans la barre d'outils
2. Cliquez sur **"Configurer la clé API DeepL"**
3. Choisissez votre type de compte : **Free** (gratuit, 500k caractères/mois) ou **Pro** (payant, illimité)
4. Entrez votre **clé d'authentification DeepL** (trouvable dans [votre compte DeepL > Clés API](https://www.deepl.com/pro-account/keys))
5. Cliquez sur **"Tester la connexion"** pour vérifier
6. Cliquez sur **"Enregistrer"**

## Utilisation

### Via le menu contextuel
1. Sélectionnez du texte dans un email reçu ou en cours de rédaction
3. Clic droit → **"Traduire en français (DeepL)"**
4. La traduction apparaît dans une notification

### Via le raccourci clavier
1. Sélectionnez du texte
2. Appuyez sur `Ctrl+Shift+T` (Windows/Linux) ou `Cmd+Shift+T` (Mac)

### Via le popup de l'extension
1. Cliquez sur l'icône de l'extension dans la barre d'outils (ou celle de la barre du message)
2. Le texte sélectionné est automatiquement récupéré
3. Cliquez sur **"Traduire en français"**
4. Le texte de la traduction est sélectionnable : Ctrl+C pour copier
5. **"Ouvrir dans une fenêtre"** pour la lire en grand dans une fenêtre flottante

## Raccourci clavier personnalisé

Allez dans **Outils > Modules complémentaires et thèmes** > **DeepL Translator** > **Préférences** > **Raccourcis** pour modifier le raccourci.

## Compatibilité

- Thunderbird 78.0 à 157.* (testé sur 157.0.1)
- WebExtension (Manifest V2)
- Compatible avec les fenêtres de lecture et de composition

## Développement

### Structure du projet
```
thunderbird-deepl-translator/
├── build.sh              # Script de build
├── icons/                # Icônes (source)
├── src/                  # Code source
│   ├── manifest.json     # Manifest WebExtension
│   ├── background.js     # Script d'arrière-plan
│   ├── popup.html/js     # Interface popup
│   ├── options.html/js   # Page d'options
│   └── icons/            # Icônes (copiées pour le build)
└── build/                # Dossier de build temporaire
```

### Build
```bash
./build.sh
```
Génère `deepl-translator-v1.0.0.xpi` à la racine du projet.

### Structure technique
- **Manifest V2** compatible Thunderbird 78+
- **Background script** non-persistant (Event Page)
- **Context Menus API** pour le menu contextuel
- **Commands API** pour le raccourci clavier
- **Storage API** pour la clé API (locale + session)
- **Notifications API** pour les résultats
- **Tabs API** pour interagir avec les onglets messages/composition

## API DeepL

L'extension utilise l'API DeepL v2 :
- Endpoint Free : `https://api-free.deepl.com/v2/translate`
- Endpoint Pro : `https://api.deepl.com/v2/translate`
- Paramètres : `target_lang=FR`, `preserve_formatting=1`

## Dépannage

| Problème | Solution |
|----------|----------|
| "Clé API non configurée" | Configurez la clé dans les options |
| "Clé API invalide" | Vérifiez la clé sur deepL.com/pro-account/keys |
| Traduction ne s'affiche pas | Vérifiez la console (Ctrl+Shift+J) |
| Raccourci ne fonctionne pas | Vérifiez les raccourcis dans les préférences de l'extension |
| Remplacement ne marche pas | Ne fonctionne que dans une fenêtre de composition |

## Journal des versions

### v1.3.1
- **Panneau de diagnostic retiré** du popup (interface nettoyée). Les
  informations de diagnostic sont conservées mais écrites dans la console du
  popup uniquement (Ctrl+Shift+J), au cas où il faudrait rediagnostiquer.

### v1.3.0
- **Notification remplacée par une fenêtre flottante.** La bulle de notification
  Windows ne peut pas afficher plus de quelques lignes : les traductions longues
  étaient tronquées. Le résultat s'ouvre maintenant dans une vraie fenêtre
  (`windows.create`, 560×500), texte intégral, défilable et sélectionnable
  (Ctrl+C). La fenêtre est **réutilisée** si elle est déjà ouverte, au lieu d'en
  empiler une par traduction. Les notifications ne servent plus qu'aux messages
  d'erreur courts.
- La fenêtre flottante permet aussi de retoucher le texte source et de relancer
  une traduction.
- **Bouton « Copier » supprimé** du popup (le texte est sélectionnable, Ctrl+C).
- **Bouton « Sélection » supprimé** : la sélection est capturée automatiquement à
  l'ouverture du popup, et un popup se ferme dès qu'on clique dans le message —
  ce bouton ne pouvait donc jamais récupérer une nouvelle sélection.
- Nouveau bouton **« Ouvrir dans une fenêtre »** dans le popup.

### v1.2.0
- Permission **`messagesModify`** ajoutée : l'API `messageDisplayScripts` ne
  fonctionne qu'avec elle (sans quoi Thunderbird n'expose même pas l'objet).
- Clé de manifeste **`message_display_scripts`** (TB 151+) : injection
  déclarative du script de capture, sans dépendre de l'API runtime.
- Script de capture rendu idempotent (double injection sans effet).

### v1.1.0 — correctif majeur
Deux bugs bloquants corrigés :

1. **`browser.contextMenus is undefined`** — `contextMenus` n'existe pas dans
   Thunderbird. L'API correcte est `browser.menus` (permission `menus`).
   Comme l'appel était au niveau racine du script, il levait une exception qui
   tuait le background *avant* l'enregistrement de `runtime.onMessage` → le popup
   recevait « Could not establish connection. Receiving end does not exist ».
   Le listener est désormais enregistré en tout premier, et toutes les parties
   optionnelles sont protégées et appelées en dernier.

2. **Sélection illisible** — `browser.messageDisplay.getSelectedText()` n'existe
   pas dans l'API Thunderbird. La sélection est maintenant capturée par un
   **message display script** (`messageDisplay.js`), enregistré via
   `browser.messageDisplayScripts.register()`, qui tourne dans le document du
   message et transmet la sélection au background (cache par onglet + réponse
   à la demande).

Autres changements : panneau de diagnostic dans le popup, bouton dans la barre
du message (`message_display_action`), test de clé API respectant Free/Pro.

### v1.0.0
Première version.

## Licence

MIT License - Développement personnel pour Thunderbird 157.0.1