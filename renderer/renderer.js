/* ============================================================
   MANDY — Renderer Process
   ============================================================ */

'use strict';

// ---- Globals ----
let cfg = {};
let currentFile = null;
let currentContent = '';
let findMatches = [];
let findIndex = 0;
let liveReload = true;
let viewMode = 'preview';       // 'preview' | 'split' | 'edit'
let hasUnsavedChanges = false;
let previewUpdateTimer = null;

// ---- Tab state ----
let tabs = [];
let activeTabId = null;
let tabCounter = 0;

// ---- Localisation ----
const LOCALES = {
  en: {
    'nav.recent':'Recent','nav.folder':'Folder','nav.outline':'Outline',
    'hdr.recents':'Recent Files','hdr.outline':'Outline','hdr.noFolder':'No folder',
    'empty.recents':'No recent files','empty.folder':'No folder open','empty.noDoc':'No document open',
    'btn.openFile':'Open File','btn.openFolder':'Open Folder','btn.newFile':'New File',
    'welcome.tagline':'A beautiful Markdown reader','welcome.recent':'Recent',
    'sc.openFile':'Open file','sc.newTab':'New tab','sc.closeTab':'Close tab',
    'sc.save':'Save','sc.editMode':'Edit mode','sc.find':'Find','sc.sidebar':'Sidebar',
    'set.settings':'Settings','set.general':'General','set.language':'Language',
    'set.appearance':'Appearance','set.theme':'Theme','set.accentColor':'Accent Color',
    'theme.dark':'Dark','theme.light':'Light','theme.sepia':'Sepia',
    'set.typography':'Typography','set.fontFamily':'Font Family',
    'font.serif':'Serif','font.sans':'Sans-serif','font.mono':'Monospace',
    'set.fontSize':'Font Size','set.lineHeight':'Line Height',
    'set.layout':'Layout','set.contentWidth':'Content Width',
    'set.code':'Code','set.codeTheme':'Code Theme',
    'set.reading':'Reading','set.liveReload':'Live reload on file change',
    'set.wordCount':'Show word count','set.smoothScroll':'Smooth scrolling',
    'btn.resetDefaults':'Reset to defaults',
    'stat.encoding':'UTF-8','stat.type':'Markdown',
    'find.placeholder':'Find in document\u2026','editor.placeholder':'Start writing Markdown\u2026',
    'words':'words','minRead':'min read','chars':'chars',
    'justNow':'just now','mAgo':'m ago','hAgo':'h ago','dAgo':'d ago',
    'noResults':'No results','saveFailed':'Save failed!',
    'drop.title':'Drop to open','drop.sub':'Markdown & text files accepted',
    'tt.unsaved':'Unsaved changes','tt.find':'Find (Ctrl+F)','tt.settings':'Settings (Ctrl+,)',
    'tt.sidebar':'Toggle sidebar (Ctrl+B)','tt.openFile':'Open file','tt.openFolder':'Open folder',
    'tt.newTab':'New tab (Ctrl+T)','tt.closeTab':'Close (Ctrl+W)',
    'tt.preview':'Preview (Ctrl+Shift+P)','tt.split':'Split view (Ctrl+Shift+E)','tt.edit':'Edit mode (Ctrl+E)',
    'tt.amber':'Amber','tt.sky':'Sky','tt.emerald':'Emerald','tt.violet':'Violet','tt.rose':'Rose','tt.teal':'Teal',
    'tt.tb.bold':'Bold (Ctrl+B)','tt.tb.italic':'Italic (Ctrl+I)','tt.tb.strike':'Strikethrough',
    'tt.tb.h1':'Heading 1','tt.tb.h2':'Heading 2','tt.tb.h3':'Heading 3',
    'tt.tb.code':'Inline code (Ctrl+\x60)','tt.tb.codeblock':'Code block',
    'tt.tb.link':'Link (Ctrl+K)','tt.tb.image':'Image',
    'tt.tb.ul':'Bullet list','tt.tb.ol':'Numbered list','tt.tb.blockquote':'Blockquote','tt.tb.hr':'Horizontal rule',
    'dlg.unsaved.title':'Unsaved Changes','dlg.unsaved.msg':'Save changes to "{name}"?',
    'dlg.unsaved.detail':"Your changes will be lost if you don't save them.",
    'dlg.unsaved.save':'Save','dlg.unsaved.dontSave':"Don't Save",'dlg.unsaved.cancel':'Cancel',
    'tt.findPrev':'Previous match','tt.findNext':'Next match',
    'cm.cut':'Cut','cm.copy':'Copy','cm.paste':'Paste','cm.copyMd':'Copy with Markdown','cm.copyText':'Copy Plain Text','cm.findDoc':'Find in Document','cm.findEditor':'Find in Editor',
    'tt.newFile':'New file','tt.newFolder':'New folder','tt.removeRecent':'Remove from recents','tt.delete':'Delete',
    'copied':'Copied!','folder.newFilePh':'filename.md','folder.newFolderPh':'folder name',
  },
  es: {
    'nav.recent':'Reciente','nav.folder':'Carpeta','nav.outline':'Esquema',
    'hdr.recents':'Archivos Recientes','hdr.outline':'Esquema','hdr.noFolder':'Sin carpeta',
    'empty.recents':'Sin archivos recientes','empty.folder':'Sin carpeta abierta','empty.noDoc':'Sin documento abierto',
    'btn.openFile':'Abrir Archivo','btn.openFolder':'Abrir Carpeta','btn.newFile':'Nuevo Archivo',
    'welcome.tagline':'Un hermoso lector de Markdown','welcome.recent':'Reciente',
    'sc.openFile':'Abrir archivo','sc.newTab':'Nueva pesta\xf1a','sc.closeTab':'Cerrar pesta\xf1a',
    'sc.save':'Guardar','sc.editMode':'Modo edici\xf3n','sc.find':'Buscar','sc.sidebar':'Panel lateral',
    'set.settings':'Ajustes','set.general':'General','set.language':'Idioma',
    'set.appearance':'Apariencia','set.theme':'Tema','set.accentColor':'Color de acento',
    'theme.dark':'Oscuro','theme.light':'Claro','theme.sepia':'Sepia',
    'set.typography':'Tipograf\xeda','set.fontFamily':'Familia tipogr\xe1fica',
    'font.serif':'Serif','font.sans':'Sans-serif','font.mono':'Monoespaciada',
    'set.fontSize':'Tama\xf1o de fuente','set.lineHeight':'Altura de l\xednea',
    'set.layout':'Dise\xf1o','set.contentWidth':'Ancho de contenido',
    'set.code':'C\xf3digo','set.codeTheme':'Tema de c\xf3digo',
    'set.reading':'Lectura','set.liveReload':'Recarga en vivo al cambiar',
    'set.wordCount':'Mostrar conteo de palabras','set.smoothScroll':'Desplazamiento suave',
    'btn.resetDefaults':'Restablecer valores predeterminados',
    'stat.encoding':'UTF-8','stat.type':'Markdown',
    'find.placeholder':'Buscar en el documento\u2026','editor.placeholder':'Empieza a escribir Markdown\u2026',
    'words':'palabras','minRead':'min de lectura','chars':'caracteres',
    'justNow':'ahora mismo','mAgo':'m atr\xe1s','hAgo':'h atr\xe1s','dAgo':'d atr\xe1s',
    'noResults':'Sin resultados','saveFailed':'\xa1Error al guardar!',
    'drop.title':'Suelta para abrir','drop.sub':'Se aceptan archivos Markdown y texto',
    'tt.unsaved':'Cambios sin guardar','tt.find':'Buscar (Ctrl+F)','tt.settings':'Ajustes (Ctrl+,)',
    'tt.sidebar':'Panel lateral (Ctrl+B)','tt.openFile':'Abrir archivo','tt.openFolder':'Abrir carpeta',
    'tt.newTab':'Nueva pesta\xf1a (Ctrl+T)','tt.closeTab':'Cerrar (Ctrl+W)',
    'tt.preview':'Vista previa (Ctrl+Shift+P)','tt.split':'Vista dividida (Ctrl+Shift+E)','tt.edit':'Modo edici\xf3n (Ctrl+E)',
    'tt.amber':'\xc1mbar','tt.sky':'Cielo','tt.emerald':'Esmeralda','tt.violet':'Violeta','tt.rose':'Rosa','tt.teal':'Verde azulado',
    'tt.tb.bold':'Negrita (Ctrl+B)','tt.tb.italic':'Cursiva (Ctrl+I)','tt.tb.strike':'Tachado',
    'tt.tb.h1':'Encabezado 1','tt.tb.h2':'Encabezado 2','tt.tb.h3':'Encabezado 3',
    'tt.tb.code':'C\xf3digo en l\xednea (Ctrl+\x60)','tt.tb.codeblock':'Bloque de c\xf3digo',
    'tt.tb.link':'Enlace (Ctrl+K)','tt.tb.image':'Imagen',
    'tt.tb.ul':'Lista de vi\xf1etas','tt.tb.ol':'Lista numerada','tt.tb.blockquote':'Cita','tt.tb.hr':'L\xednea horizontal',
    'dlg.unsaved.title':'Cambios sin guardar','dlg.unsaved.msg':'¿Guardar cambios en "{name}"?',
    'dlg.unsaved.detail':'Los cambios se perderán si no los guardas.',
    'dlg.unsaved.save':'Guardar','dlg.unsaved.dontSave':'No guardar','dlg.unsaved.cancel':'Cancelar',
    'tt.findPrev':'Coincidencia anterior','tt.findNext':'Siguiente coincidencia',
    'cm.cut':'Cortar','cm.copy':'Copiar','cm.paste':'Pegar','cm.copyMd':'Copiar con Markdown','cm.copyText':'Copiar texto plano','cm.findDoc':'Buscar en el documento','cm.findEditor':'Buscar en el editor',
    'tt.newFile':'Nuevo archivo','tt.newFolder':'Nueva carpeta','tt.removeRecent':'Eliminar de recientes','tt.delete':'Eliminar',
    'copied':'\u00a1Copiado!','folder.newFilePh':'archivo.md','folder.newFolderPh':'nombre de carpeta',
  },
  fr: {
    'nav.recent':'R\xe9cent','nav.folder':'Dossier','nav.outline':'Plan',
    'hdr.recents':'Fichiers r\xe9cents','hdr.outline':'Plan','hdr.noFolder':'Aucun dossier',
    'empty.recents':'Aucun fichier r\xe9cent','empty.folder':'Aucun dossier ouvert','empty.noDoc':'Aucun document ouvert',
    'btn.openFile':'Ouvrir un fichier','btn.openFolder':'Ouvrir un dossier','btn.newFile':'Nouveau Fichier',
    'welcome.tagline':'Un magnifique lecteur Markdown','welcome.recent':'R\xe9cent',
    'sc.openFile':'Ouvrir un fichier','sc.newTab':'Nouvel onglet','sc.closeTab':'Fermer l\u2019onglet',
    'sc.save':'Enregistrer','sc.editMode':'\xc9dition','sc.find':'Rechercher','sc.sidebar':'Barre lat\xe9rale',
    'set.settings':'Param\xe8tres','set.general':'G\xe9n\xe9ral','set.language':'Langue',
    'set.appearance':'Apparence','set.theme':'Th\xe8me','set.accentColor':'Couleur d\u2019accent',
    'theme.dark':'Sombre','theme.light':'Clair','theme.sepia':'S\xe9pia',
    'set.typography':'Typographie','set.fontFamily':'Police de caract\xe8res',
    'font.serif':'Serif','font.sans':'Sans-serif','font.mono':'Monospace',
    'set.fontSize':'Taille de police','set.lineHeight':'Hauteur de ligne',
    'set.layout':'Mise en page','set.contentWidth':'Largeur du contenu',
    'set.code':'Code','set.codeTheme':'Th\xe8me de code',
    'set.reading':'Lecture','set.liveReload':'Rechargement en direct',
    'set.wordCount':'Afficher le nombre de mots','set.smoothScroll':'D\xe9filement fluide',
    'btn.resetDefaults':'R\xe9initialiser',
    'stat.encoding':'UTF-8','stat.type':'Markdown',
    'find.placeholder':'Rechercher dans le document\u2026','editor.placeholder':'\xc9crire en Markdown\u2026',
    'words':'mots','minRead':'min de lecture','chars':'caract\xe8res',
    'justNow':'\xe0 l\u2019instant','mAgo':'min','hAgo':'h','dAgo':'j',
    'noResults':'Aucun r\xe9sultat','saveFailed':'\xc9chec de la sauvegarde !',
    'drop.title':'D\xe9poser pour ouvrir','drop.sub':'Fichiers Markdown et texte accept\xe9s',
    'tt.unsaved':'Modifications non enregistr\xe9es','tt.find':'Rechercher (Ctrl+F)','tt.settings':'Param\xe8tres (Ctrl+,)',
    'tt.sidebar':'Barre lat\xe9rale (Ctrl+B)','tt.openFile':'Ouvrir un fichier','tt.openFolder':'Ouvrir un dossier',
    'tt.newTab':'Nouvel onglet (Ctrl+T)','tt.closeTab':'Fermer (Ctrl+W)',
    'tt.preview':'Aper\xe7u (Ctrl+Shift+P)','tt.split':'Vue partag\xe9e (Ctrl+Shift+E)','tt.edit':'\xc9dition (Ctrl+E)',
    'tt.amber':'Ambre','tt.sky':'Ciel','tt.emerald':'\xc9meraude','tt.violet':'Violet','tt.rose':'Rose','tt.teal':'Sarcelle',
    'tt.tb.bold':'Gras (Ctrl+B)','tt.tb.italic':'Italique (Ctrl+I)','tt.tb.strike':'Barr\xe9',
    'tt.tb.h1':'Titre 1','tt.tb.h2':'Titre 2','tt.tb.h3':'Titre 3',
    'tt.tb.code':'Code en ligne (Ctrl+\x60)','tt.tb.codeblock':'Bloc de code',
    'tt.tb.link':'Lien (Ctrl+K)','tt.tb.image':'Image',
    'tt.tb.ul':'Liste \xe0 puces','tt.tb.ol':'Liste num\xe9rot\xe9e','tt.tb.blockquote':'Citation','tt.tb.hr':'Ligne horizontale',
    'dlg.unsaved.title':'Modifications non enregistr\xe9es','dlg.unsaved.msg':'Enregistrer les modifications de \u00ab\u00a0{name}\u00a0\u00bb\u00a0?',
    'dlg.unsaved.detail':'Vos modifications seront perdues si vous ne les enregistrez pas.',
    'dlg.unsaved.save':'Enregistrer','dlg.unsaved.dontSave':'Ne pas enregistrer','dlg.unsaved.cancel':'Annuler',
    'tt.findPrev':'Correspondance pr\u00e9c\u00e9dente','tt.findNext':'Correspondance suivante',
    'cm.cut':'Couper','cm.copy':'Copier','cm.paste':'Coller','cm.copyMd':'Copier avec Markdown','cm.copyText':'Copier en texte brut','cm.findDoc':'Rechercher dans le document','cm.findEditor':'Rechercher dans l\u2019\u00e9diteur',
    'tt.newFile':'Nouveau fichier','tt.newFolder':'Nouveau dossier','tt.removeRecent':'Supprimer des r\u00e9cents','tt.delete':'Supprimer',
    'copied':'Copi\u00e9\u00a0!','folder.newFilePh':'fichier.md','folder.newFolderPh':'nom du dossier',
  },
  de: {
    'nav.recent':'Zuletzt','nav.folder':'Ordner','nav.outline':'Gliederung',
    'hdr.recents':'Zuletzt ge\xf6ffnet','hdr.outline':'Gliederung','hdr.noFolder':'Kein Ordner',
    'empty.recents':'Keine zuletzt ge\xf6ffneten Dateien','empty.folder':'Kein Ordner ge\xf6ffnet','empty.noDoc':'Kein Dokument ge\xf6ffnet',
    'btn.openFile':'Datei \xf6ffnen','btn.openFolder':'Ordner \xf6ffnen','btn.newFile':'Neue Datei',
    'welcome.tagline':'Ein sch\xf6ner Markdown-Reader','welcome.recent':'Zuletzt',
    'sc.openFile':'Datei \xf6ffnen','sc.newTab':'Neuer Tab','sc.closeTab':'Tab schlie\xdfen',
    'sc.save':'Speichern','sc.editMode':'Bearbeitungsmodus','sc.find':'Suchen','sc.sidebar':'Seitenleiste',
    'set.settings':'Einstellungen','set.general':'Allgemein','set.language':'Sprache',
    'set.appearance':'Erscheinungsbild','set.theme':'Thema','set.accentColor':'Akzentfarbe',
    'theme.dark':'Dunkel','theme.light':'Hell','theme.sepia':'Sepia',
    'set.typography':'Typografie','set.fontFamily':'Schriftfamilie',
    'font.serif':'Serif','font.sans':'Sans-Serif','font.mono':'Monospace',
    'set.fontSize':'Schriftgr\xf6\xdfe','set.lineHeight':'Zeilenh\xf6he',
    'set.layout':'Layout','set.contentWidth':'Inhaltsbreite',
    'set.code':'Code','set.codeTheme':'Code-Thema',
    'set.reading':'Lesen','set.liveReload':'Live-Neuladen bei \xc4nderung',
    'set.wordCount':'Wortanzahl anzeigen','set.smoothScroll':'Sanftes Scrollen',
    'btn.resetDefaults':'Standardwerte zur\xfccksetzen',
    'stat.encoding':'UTF-8','stat.type':'Markdown',
    'find.placeholder':'Im Dokument suchen\u2026','editor.placeholder':'Markdown schreiben\u2026',
    'words':'W\xf6rter','minRead':'Min. Lesen','chars':'Zeichen',
    'justNow':'gerade eben','mAgo':' Min.','hAgo':' Std.','dAgo':' T.',
    'noResults':'Keine Ergebnisse','saveFailed':'Speichern fehlgeschlagen!',
    'drop.title':'Zum \xd6ffnen ablegen','drop.sub':'Markdown- und Textdateien akzeptiert',
    'tt.unsaved':'Nicht gespeicherte \xc4nderungen','tt.find':'Suchen (Ctrl+F)','tt.settings':'Einstellungen (Ctrl+,)',
    'tt.sidebar':'Seitenleiste (Ctrl+B)','tt.openFile':'Datei \xf6ffnen','tt.openFolder':'Ordner \xf6ffnen',
    'tt.newTab':'Neuer Tab (Ctrl+T)','tt.closeTab':'Schlie\xdfen (Ctrl+W)',
    'tt.preview':'Vorschau (Ctrl+Shift+P)','tt.split':'Geteilte Ansicht (Ctrl+Shift+E)','tt.edit':'Bearbeiten (Ctrl+E)',
    'tt.amber':'Bernstein','tt.sky':'Himmel','tt.emerald':'Smaragd','tt.violet':'Violett','tt.rose':'Rosa','tt.teal':'Petrol',
    'tt.tb.bold':'Fett (Ctrl+B)','tt.tb.italic':'Kursiv (Ctrl+I)','tt.tb.strike':'Durchgestrichen',
    'tt.tb.h1':'\xdcberschrift 1','tt.tb.h2':'\xdcberschrift 2','tt.tb.h3':'\xdcberschrift 3',
    'tt.tb.code':'Inline-Code (Ctrl+\x60)','tt.tb.codeblock':'Codeblock',
    'tt.tb.link':'Link (Ctrl+K)','tt.tb.image':'Bild',
    'tt.tb.ul':'Aufz\xe4hlungsliste','tt.tb.ol':'Nummerierte Liste','tt.tb.blockquote':'Blockzitat','tt.tb.hr':'Horizontale Linie',
    'dlg.unsaved.title':'Nicht gespeicherte \xc4nderungen','dlg.unsaved.msg':'\xc4nderungen in \u201e{name}\u201c speichern?',
    'dlg.unsaved.detail':'Ihre \xc4nderungen gehen verloren, wenn Sie nicht speichern.',
    'dlg.unsaved.save':'Speichern','dlg.unsaved.dontSave':'Nicht speichern','dlg.unsaved.cancel':'Abbrechen',
    'tt.findPrev':'Vorherige \u00dcbereinstimmung','tt.findNext':'N\u00e4chste \u00dcbereinstimmung',
    'cm.cut':'Ausschneiden','cm.copy':'Kopieren','cm.paste':'Einfügen','cm.copyMd':'Mit Markdown kopieren','cm.copyText':'Als Text kopieren','cm.findDoc':'Im Dokument suchen','cm.findEditor':'Im Editor suchen',
    'tt.newFile':'Neue Datei','tt.newFolder':'Neuer Ordner','tt.removeRecent':'Aus Zuletzt entfernen','tt.delete':'L\u00f6schen',
    'copied':'Kopiert!','folder.newFilePh':'datei.md','folder.newFolderPh':'Ordnername',
  },
  pt: {
    'nav.recent':'Recente','nav.folder':'Pasta','nav.outline':'Estrutura',
    'hdr.recents':'Ficheiros Recentes','hdr.outline':'Estrutura','hdr.noFolder':'Sem pasta',
    'empty.recents':'Sem ficheiros recentes','empty.folder':'Sem pasta aberta','empty.noDoc':'Sem documento aberto',
    'btn.openFile':'Abrir Ficheiro','btn.openFolder':'Abrir Pasta','btn.newFile':'Novo Ficheiro',
    'welcome.tagline':'Um lindo leitor de Markdown','welcome.recent':'Recente',
    'sc.openFile':'Abrir ficheiro','sc.newTab':'Novo separador','sc.closeTab':'Fechar separador',
    'sc.save':'Guardar','sc.editMode':'Modo de edi\xe7\xe3o','sc.find':'Localizar','sc.sidebar':'Painel lateral',
    'set.settings':'Defini\xe7\xf5es','set.general':'Geral','set.language':'Idioma',
    'set.appearance':'Apar\xeancia','set.theme':'Tema','set.accentColor':'Cor de destaque',
    'theme.dark':'Escuro','theme.light':'Claro','theme.sepia':'S\xe9pia',
    'set.typography':'Tipografia','set.fontFamily':'Fam\xedlia de fontes',
    'font.serif':'Serif','font.sans':'Sans-serif','font.mono':'Monoespa\xe7ada',
    'set.fontSize':'Tamanho da fonte','set.lineHeight':'Altura da linha',
    'set.layout':'Layout','set.contentWidth':'Largura do conte\xfado',
    'set.code':'C\xf3digo','set.codeTheme':'Tema de c\xf3digo',
    'set.reading':'Leitura','set.liveReload':'Recarregar ao alterar',
    'set.wordCount':'Mostrar contagem de palavras','set.smoothScroll':'Rolagem suave',
    'btn.resetDefaults':'Repor predefini\xe7\xf5es',
    'stat.encoding':'UTF-8','stat.type':'Markdown',
    'find.placeholder':'Localizar no documento\u2026','editor.placeholder':'Come\xe7ar a escrever Markdown\u2026',
    'words':'palavras','minRead':'min de leitura','chars':'caracteres',
    'justNow':'agora mesmo','mAgo':'min atr\xe1s','hAgo':'h atr\xe1s','dAgo':'d atr\xe1s',
    'noResults':'Sem resultados','saveFailed':'Falha ao guardar!',
    'drop.title':'Soltar para abrir','drop.sub':'Ficheiros Markdown e texto aceites',
    'tt.unsaved':'Altera\xe7\xf5es n\xe3o guardadas','tt.find':'Localizar (Ctrl+F)','tt.settings':'Defini\xe7\xf5es (Ctrl+,)',
    'tt.sidebar':'Painel lateral (Ctrl+B)','tt.openFile':'Abrir ficheiro','tt.openFolder':'Abrir pasta',
    'tt.newTab':'Novo separador (Ctrl+T)','tt.closeTab':'Fechar (Ctrl+W)',
    'tt.preview':'Pr\xe9-visualiza\xe7\xe3o (Ctrl+Shift+P)','tt.split':'Vista dividida (Ctrl+Shift+E)','tt.edit':'Modo de edi\xe7\xe3o (Ctrl+E)',
    'tt.amber':'\xc2mbar','tt.sky':'C\xe9u','tt.emerald':'Esmeralda','tt.violet':'Violeta','tt.rose':'Rosa','tt.teal':'Verde-azulado',
    'tt.tb.bold':'Negrito (Ctrl+B)','tt.tb.italic':'It\xe1lico (Ctrl+I)','tt.tb.strike':'Riscado',
    'tt.tb.h1':'T\xedtulo 1','tt.tb.h2':'T\xedtulo 2','tt.tb.h3':'T\xedtulo 3',
    'tt.tb.code':'C\xf3digo em linha (Ctrl+\x60)','tt.tb.codeblock':'Bloco de c\xf3digo',
    'tt.tb.link':'Liga\xe7\xe3o (Ctrl+K)','tt.tb.image':'Imagem',
    'tt.tb.ul':'Lista de marcadores','tt.tb.ol':'Lista numerada','tt.tb.blockquote':'Cita\xe7\xe3o','tt.tb.hr':'Linha horizontal',
    'dlg.unsaved.title':'Altera\xe7\xf5es n\xe3o guardadas','dlg.unsaved.msg':'Guardar altera\xe7\xf5es em \u201c{name}\u201d?',
    'dlg.unsaved.detail':'As suas altera\xe7\xf5es ser\xe3o perdidas se n\xe3o as guardar.',
    'dlg.unsaved.save':'Guardar','dlg.unsaved.dontSave':'N\xe3o guardar','dlg.unsaved.cancel':'Cancelar',
    'tt.findPrev':'Correspond\u00eancia anterior','tt.findNext':'Pr\u00f3xima correspond\u00eancia',
    'cm.cut':'Cortar','cm.copy':'Copiar','cm.paste':'Colar','cm.copyMd':'Copiar com Markdown','cm.copyText':'Copiar texto simples','cm.findDoc':'Localizar no documento','cm.findEditor':'Localizar no editor',
    'tt.newFile':'Novo ficheiro','tt.newFolder':'Nova pasta','tt.removeRecent':'Remover dos recentes','tt.delete':'Eliminar',
    'copied':'Copiado!','folder.newFilePh':'ficheiro.md','folder.newFolderPh':'nome da pasta',
  },
  ja: {
    'nav.recent':'\u6700\u8fd1','nav.folder':'\u30d5\u30a9\u30eb\u30c0','nav.outline':'\u30a2\u30a6\u30c8\u30e9\u30a4\u30f3',
    'hdr.recents':'\u6700\u8fd1\u306e\u30d5\u30a1\u30a4\u30eb','hdr.outline':'\u30a2\u30a6\u30c8\u30e9\u30a4\u30f3','hdr.noFolder':'\u30d5\u30a9\u30eb\u30c0\u306a\u3057',
    'empty.recents':'\u6700\u8fd1\u306e\u30d5\u30a1\u30a4\u30eb\u306f\u3042\u308a\u307e\u305b\u3093','empty.folder':'\u30d5\u30a9\u30eb\u30c0\u304c\u958b\u3044\u3066\u3044\u307e\u305b\u3093','empty.noDoc':'\u30c9\u30ad\u30e5\u30e1\u30f3\u30c8\u304c\u958b\u3044\u3066\u3044\u307e\u305b\u3093',
    'btn.openFile':'\u30d5\u30a1\u30a4\u30eb\u3092\u958b\u304f','btn.openFolder':'\u30d5\u30a9\u30eb\u30c0\u3092\u958b\u304f','btn.newFile':'\u65b0\u898f\u30d5\u30a1\u30a4\u30eb',
    'welcome.tagline':'\u7f8e\u3057\u3044Markdown\u30ea\u30fc\u30c0\u30fc','welcome.recent':'\u6700\u8fd1',
    'sc.openFile':'\u30d5\u30a1\u30a4\u30eb\u3092\u958b\u304f','sc.newTab':'\u65b0\u3057\u3044\u30bf\u30d6','sc.closeTab':'\u30bf\u30d6\u3092\u9589\u3058\u308b',
    'sc.save':'\u4fdd\u5b58','sc.editMode':'\u7de8\u96c6\u30e2\u30fc\u30c9','sc.find':'\u691c\u7d22','sc.sidebar':'\u30b5\u30a4\u30c9\u30d0\u30fc',
    'set.settings':'\u8a2d\u5b9a','set.general':'\u4e00\u822c','set.language':'\u8a00\u8a9e',
    'set.appearance':'\u5916\u89b3','set.theme':'\u30c6\u30fc\u30de','set.accentColor':'\u30a2\u30af\u30bb\u30f3\u30c8\u30ab\u30e9\u30fc',
    'theme.dark':'\u30c0\u30fc\u30af','theme.light':'\u30e9\u30a4\u30c8','theme.sepia':'\u30bb\u30d4\u30a2',
    'set.typography':'\u30bf\u30a4\u30dd\u30b0\u30e9\u30d5\u30a3','set.fontFamily':'\u30d5\u30a9\u30f3\u30c8\u30d5\u30a1\u30df\u30ea\u30fc',
    'font.serif':'\u30bb\u30ea\u30d5','font.sans':'\u30b5\u30f3\u30bb\u30ea\u30d5','font.mono':'\u7b49\u5e45',
    'set.fontSize':'\u30d5\u30a9\u30f3\u30c8\u30b5\u30a4\u30ba','set.lineHeight':'\u884c\u306e\u9ad8\u3055',
    'set.layout':'\u30ec\u30a4\u30a2\u30a6\u30c8','set.contentWidth':'\u30b3\u30f3\u30c6\u30f3\u30c4\u5e45',
    'set.code':'\u30b3\u30fc\u30c9','set.codeTheme':'\u30b3\u30fc\u30c9\u30c6\u30fc\u30de',
    'set.reading':'\u8aad\u66f8','set.liveReload':'\u30d5\u30a1\u30a4\u30eb\u5909\u66f4\u6642\u306b\u518d\u8aad\u8fbc',
    'set.wordCount':'\u5358\u8a9e\u6570\u3092\u8868\u793a','set.smoothScroll':'\u30b9\u30e0\u30fc\u30ba\u30b9\u30af\u30ed\u30fc\u30eb',
    'btn.resetDefaults':'\u30c7\u30d5\u30a9\u30eb\u30c8\u306b\u30ea\u30bb\u30c3\u30c8',
    'stat.encoding':'UTF-8','stat.type':'Markdown',
    'find.placeholder':'\u30c9\u30ad\u30e5\u30e1\u30f3\u30c8\u3092\u691c\u7d22\u2026','editor.placeholder':'Markdown\u3092\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044\u2026',
    'words':'\u8a9e','minRead':'\u5206\u3067\u8aad\u3081\u308b','chars':'\u6587\u5b57',
    'justNow':'\u305f\u3063\u305f\u4eca','mAgo':'\u5206\u524d','hAgo':'\u6642\u9593\u524d','dAgo':'\u65e5\u524d',
    'noResults':'\u7d50\u679c\u306a\u3057','saveFailed':'\u4fdd\u5b58\u306b\u5931\u6557\u3057\u307e\u3057\u305f\uff01',
    'drop.title':'\u30c9\u30ed\u30c3\u30d7\u3057\u3066\u958b\u304f','drop.sub':'Markdown\u3068\u30c6\u30ad\u30b9\u30c8\u30d5\u30a1\u30a4\u30eb\u306b\u5bfe\u5fdc',
    'tt.unsaved':'\u672a\u4fdd\u5b58\u306e\u5909\u66f4','tt.find':'\u691c\u7d22 (Ctrl+F)','tt.settings':'\u8a2d\u5b9a (Ctrl+,)',
    'tt.sidebar':'\u30b5\u30a4\u30c9\u30d0\u30fc (Ctrl+B)','tt.openFile':'\u30d5\u30a1\u30a4\u30eb\u3092\u958b\u304f','tt.openFolder':'\u30d5\u30a9\u30eb\u30c0\u3092\u958b\u304f',
    'tt.newTab':'\u65b0\u3057\u3044\u30bf\u30d6 (Ctrl+T)','tt.closeTab':'\u9589\u3058\u308b (Ctrl+W)',
    'tt.preview':'\u30d7\u30ec\u30d3\u30e5\u30fc (Ctrl+Shift+P)','tt.split':'\u5206\u5272\u8868\u793a (Ctrl+Shift+E)','tt.edit':'\u7de8\u96c6\u30e2\u30fc\u30c9 (Ctrl+E)',
    'tt.amber':'\u30a2\u30f3\u30d0\u30fc','tt.sky':'\u30b9\u30ab\u30a4','tt.emerald':'\u30a8\u30e1\u30e9\u30eb\u30c9','tt.violet':'\u30d0\u30a4\u30aa\u30ec\u30c3\u30c8','tt.rose':'\u30ed\u30fc\u30ba','tt.teal':'\u30c6\u30a3\u30fc\u30eb',
    'tt.tb.bold':'\u592a\u5b57 (Ctrl+B)','tt.tb.italic':'\u659c\u4f53 (Ctrl+I)','tt.tb.strike':'\u53d6\u308a\u6d88\u3057\u7dda',
    'tt.tb.h1':'\u898b\u51fa\u3057\uff11','tt.tb.h2':'\u898b\u51fa\u3057\uff12','tt.tb.h3':'\u898b\u51fa\u3057\uff13',
    'tt.tb.code':'\u30a4\u30f3\u30e9\u30a4\u30f3\u30b3\u30fc\u30c9 (Ctrl+\x60)','tt.tb.codeblock':'\u30b3\u30fc\u30c9\u30d6\u30ed\u30c3\u30af',
    'tt.tb.link':'\u30ea\u30f3\u30af (Ctrl+K)','tt.tb.image':'\u753b\u50cf',
    'tt.tb.ul':'\u7b87\u6761\u66f8\u304d','tt.tb.ol':'\u756a\u53f7\u4ed8\u304d\u30ea\u30b9\u30c8','tt.tb.blockquote':'\u5f15\u7528','tt.tb.hr':'\u6c34\u5e73\u7dda',
    'dlg.unsaved.title':'\u672a\u4fdd\u5b58\u306e\u5909\u66f4','dlg.unsaved.msg':'\u300c{name}\u300d\u3078\u306e\u5909\u66f4\u3092\u4fdd\u5b58\u3057\u307e\u3059\u304b\uff1f',
    'dlg.unsaved.detail':'\u4fdd\u5b58\u3057\u306a\u3044\u3068\u5909\u66f4\u304c\u5931\u308f\u308c\u307e\u3059\u3002',
    'dlg.unsaved.save':'\u4fdd\u5b58','dlg.unsaved.dontSave':'\u4fdd\u5b58\u3057\u306a\u3044','dlg.unsaved.cancel':'\u30ad\u30e3\u30f3\u30bb\u30eb',
    'tt.findPrev':'\u524d\u306e\u4e00\u81f4','tt.findNext':'\u6b21\u306e\u4e00\u81f4',
    'cm.copyMd':'Markdown\u3067\u30b3\u30d4\u30fc','cm.copyText':'\u30c6\u30ad\u30b9\u30c8\u3068\u3057\u3066\u30b3\u30d4\u30fc','cm.findDoc':'\u30c9\u30ad\u30e5\u30e1\u30f3\u30c8\u3067\u691c\u7d22','cm.findEditor':'\u30a8\u30c7\u30a3\u30bf\u3067\u691c\u7d22',
    'tt.newFile':'\u65b0\u3057\u3044\u30d5\u30a1\u30a4\u30eb','tt.newFolder':'\u65b0\u3057\u3044\u30d5\u30a9\u30eb\u30c0','tt.removeRecent':'\u6700\u8fd1\u304b\u3089\u524a\u9664','tt.delete':'\u524a\u9664',
    'copied':'\u30b3\u30d4\u30fc\u3057\u307e\u3057\u305f\uff01','folder.newFilePh':'\u30d5\u30a1\u30a4\u30eb\u540d.md','folder.newFolderPh':'\u30d5\u30a9\u30eb\u30c0\u540d',
  },
  zh: {
    'nav.recent':'\u6700\u8fd1','nav.folder':'\u6587\u4ef6\u5939','nav.outline':'\u5927\u7eb2',
    'hdr.recents':'\u6700\u8fd1\u6587\u4ef6','hdr.outline':'\u5927\u7eb2','hdr.noFolder':'\u65e0\u6587\u4ef6\u5939',
    'empty.recents':'\u6ca1\u6709\u6700\u8fd1\u6587\u4ef6','empty.folder':'\u672a\u6253\u5f00\u6587\u4ef6\u5939','empty.noDoc':'\u672a\u6253\u5f00\u6587\u6863',
    'btn.openFile':'\u6253\u5f00\u6587\u4ef6','btn.openFolder':'\u6253\u5f00\u6587\u4ef6\u5939','btn.newFile':'\u65b0\u5efa\u6587\u4ef6',
    'welcome.tagline':'\u4e00\u6b3e\u7cbe\u7f8e\u7684 Markdown \u9605\u8bfb\u5668','welcome.recent':'\u6700\u8fd1',
    'sc.openFile':'\u6253\u5f00\u6587\u4ef6','sc.newTab':'\u65b0\u6807\u7b7e\u9875','sc.closeTab':'\u5173\u95ed\u6807\u7b7e\u9875',
    'sc.save':'\u4fdd\u5b58','sc.editMode':'\u7f16\u8f91\u6a21\u5f0f','sc.find':'\u67e5\u627e','sc.sidebar':'\u4fa7\u8fb9\u680f',
    'set.settings':'\u8bbe\u7f6e','set.general':'\u901a\u7528','set.language':'\u8bed\u8a00',
    'set.appearance':'\u5916\u89c2','set.theme':'\u4e3b\u9898','set.accentColor':'\u5f3a\u8c03\u8272',
    'theme.dark':'\u6df1\u8272','theme.light':'\u6d45\u8272','theme.sepia':'\u68d5\u8910\u8272',
    'set.typography':'\u5b57\u4f53\u6392\u7248','set.fontFamily':'\u5b57\u4f53\u65cf',
    'font.serif':'\u886c\u7ebf\u4f53','font.sans':'\u65e0\u886c\u7ebf\u4f53','font.mono':'\u7b49\u5bbd\u5b57\u4f53',
    'set.fontSize':'\u5b57\u4f53\u5927\u5c0f','set.lineHeight':'\u884c\u9ad8',
    'set.layout':'\u5e03\u5c40','set.contentWidth':'\u5185\u5bb9\u5bbd\u5ea6',
    'set.code':'\u4ee3\u7801','set.codeTheme':'\u4ee3\u7801\u4e3b\u9898',
    'set.reading':'\u9605\u8bfb','set.liveReload':'\u6587\u4ef6\u53d8\u66f4\u65f6\u81ea\u52a8\u91cd\u8f7d',
    'set.wordCount':'\u663e\u793a\u5b57\u6570','set.smoothScroll':'\u5e73\u6ed1\u6eda\u52a8',
    'btn.resetDefaults':'\u6062\u590d\u9ed8\u8ba4\u8bbe\u7f6e',
    'stat.encoding':'UTF-8','stat.type':'Markdown',
    'find.placeholder':'\u5728\u6587\u6863\u4e2d\u67e5\u627e\u2026','editor.placeholder':'\u5f00\u59cb\u4e66\u5199 Markdown\u2026',
    'words':'\u8bcd','minRead':'\u5206\u949f\u9605\u8bfb','chars':'\u5b57\u7b26',
    'justNow':'\u521a\u521a','mAgo':'\u5206\u949f\u524d','hAgo':'\u5c0f\u65f6\u524d','dAgo':'\u5929\u524d',
    'noResults':'\u65e0\u7ed3\u679c','saveFailed':'\u4fdd\u5b58\u5931\u8d25\uff01',
    'drop.title':'\u62d6\u653e\u4ee5\u6253\u5f00','drop.sub':'\u652f\u6301 Markdown \u548c\u6587\u672c\u6587\u4ef6',
    'tt.unsaved':'\u672a\u4fdd\u5b58\u7684\u66f4\u6539','tt.find':'\u67e5\u627e (Ctrl+F)','tt.settings':'\u8bbe\u7f6e (Ctrl+,)',
    'tt.sidebar':'\u4fa7\u8fb9\u680f (Ctrl+B)','tt.openFile':'\u6253\u5f00\u6587\u4ef6','tt.openFolder':'\u6253\u5f00\u6587\u4ef6\u5939',
    'tt.newTab':'\u65b0\u6807\u7b7e\u9875 (Ctrl+T)','tt.closeTab':'\u5173\u95ed (Ctrl+W)',
    'tt.preview':'\u9884\u89c8 (Ctrl+Shift+P)','tt.split':'\u5206\u5c4f\u89c6\u56fe (Ctrl+Shift+E)','tt.edit':'\u7f16\u8f91\u6a21\u5f0f (Ctrl+E)',
    'tt.amber':'\u7425\u73c0','tt.sky':'\u5929\u84dd','tt.emerald':'\u7fe1\u7fe0','tt.violet':'\u7d2b\u7f57\u5170','tt.rose':'\u73ab\u7ea2','tt.teal':'\u9752\u7fe0',
    'tt.tb.bold':'\u7c97\u4f53 (Ctrl+B)','tt.tb.italic':'\u659c\u4f53 (Ctrl+I)','tt.tb.strike':'\u5220\u9664\u7ebf',
    'tt.tb.h1':'\u6807\u9898 1','tt.tb.h2':'\u6807\u9898 2','tt.tb.h3':'\u6807\u9898 3',
    'tt.tb.code':'\u884c\u5185\u4ee3\u7801 (Ctrl+\x60)','tt.tb.codeblock':'\u4ee3\u7801\u5757',
    'tt.tb.link':'\u94fe\u63a5 (Ctrl+K)','tt.tb.image':'\u56fe\u7247',
    'tt.tb.ul':'\u65e0\u5e8f\u5217\u8868','tt.tb.ol':'\u6709\u5e8f\u5217\u8868','tt.tb.blockquote':'\u5f15\u7528','tt.tb.hr':'\u5206\u9694\u7ebf',
    'dlg.unsaved.title':'\u672a\u4fdd\u5b58\u7684\u66f4\u6539','dlg.unsaved.msg':'\u4fdd\u5b58\u5bf9\u201c{name}\u201d\u7684\u66f4\u6539\uff1f',
    'dlg.unsaved.detail':'\u5982\u679c\u4e0d\u4fdd\u5b58\uff0c\u66f4\u6539\u5c06\u4f1a\u4e22\u5931\u3002',
    'dlg.unsaved.save':'\u4fdd\u5b58','dlg.unsaved.dontSave':'\u4e0d\u4fdd\u5b58','dlg.unsaved.cancel':'\u53d6\u6d88',
    'tt.findPrev':'\u4e0a\u4e00\u4e2a\u5339\u914d','tt.findNext':'\u4e0b\u4e00\u4e2a\u5339\u914d',
    'cm.cut':'剪切','cm.copy':'复制','cm.paste':'粘贴','cm.copyMd':'\u590d\u5236\u4e3a Markdown','cm.copyText':'\u590d\u5236\u4e3a\u7eaf\u6587\u672c','cm.findDoc':'\u5728\u6587\u6863\u4e2d\u67e5\u627e','cm.findEditor':'\u5728\u7f16\u8f91\u5668\u4e2d\u67e5\u627e',
    'tt.newFile':'\u65b0\u5efa\u6587\u4ef6','tt.newFolder':'\u65b0\u5efa\u6587\u4ef6\u5939','tt.removeRecent':'\u4ece\u6700\u8fd1\u79fb\u9664','tt.delete':'\u5220\u9664',
    'copied':'\u5df2\u590d\u5236\uff01','folder.newFilePh':'\u6587\u4ef6\u540d.md','folder.newFolderPh':'\u6587\u4ef6\u5939\u540d\u79f0',
  },
};

let currentLang = 'en';
let loadedFolderName = null; // null = no folder open yet
let loadedFolderPath = null;

function t(key) {
  return (LOCALES[currentLang] || LOCALES.en)[key] ?? LOCALES.en[key] ?? key;
}

function applyTranslations() {
  $$('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  $$('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
  $$('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
}

function refreshDynamicText() {
  if (!loadedFolderName) dom.folderName.textContent = t('hdr.noFolder');
  const activeTab = tabs.find(tab => tab.id === activeTabId);
  if (activeTab && activeTab.content && cfg.showWordCount !== false) {
    const words = countWords(activeTab.content);
    dom.docStats.words.textContent = `${words.toLocaleString()} ${t('words')}`;
    dom.docStats.read.textContent  = `~${Math.max(1, Math.round(words / 200))} ${t('minRead')}`;
    dom.docStats.chars.textContent = `${activeTab.content.length.toLocaleString()} ${t('chars')}`;
  }
}

function setLanguage(lang) {
  currentLang = LOCALES[lang] ? lang : 'en';
  document.documentElement.lang = currentLang;
  applyTranslations();
  refreshDynamicText();
}

// ---- DOM refs ----
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

const dom = {
  body: document.body,
  fileTitle: $('#file-title'),
  unsavedDot: $('#unsaved-dot'),
  progressFill: $('#progress-fill'),
  findBar: $('#find-bar'),
  findInput: $('#find-input'),
  findCount: $('#find-count'),
  sidebar: $('#sidebar'),
  recentsList: $('#recents-list'),
  recentsEmpty: $('#recents-empty'),
  folderList: $('#folder-list'),
  folderEmpty: $('#folder-empty'),
  folderName: $('#folder-name'),
  tocList: $('#toc-list'),
  tocEmpty: $('#toc-empty'),
  welcome: $('#welcome'),
  welcomeRecents: $('#welcome-recents'),
  viewer: $('#viewer'),
  scrollContainer: $('#scroll-container'),
  mdContent: $('#md-content'),
  docFilename: $('#doc-filename'),
  docStats: { words: $('#stat-words'), read: $('#stat-read'), chars: $('#stat-chars') },
  scrollThumb: $('#scroll-thumb'),
  settingsOverlay: $('#settings-overlay'),
  statusFile: $('#status-file'),
  statusPos: $('#status-pos'),
  editorPane: $('#editor-pane'),
  editorTextarea: $('#editor-textarea'),
  editorPos: $('#editor-pos'),
  editorChars: $('#editor-chars'),
};

// ---- Heading IDs (added post-render via DOM — sidesteps marked v13 token quirks) ----
function addHeadingIds() {
  $$('h1,h2,h3,h4,h5,h6', dom.mdContent).forEach(h => {
    if (!h.id) {
      h.id = h.textContent
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
    }
  });
}

// ---- Highlight.js theme injection ----
// Use a <link> element so the browser loads the CSS natively (no IPC round-trip).
// Relative path resolves from renderer/ up to the project root node_modules/.
function applyHljsTheme(theme) {
  let link = $('#hljs-theme');
  if (!link) {
    link = document.createElement('link');
    link.id = 'hljs-theme';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }
  const base = '../node_modules/highlight.js/styles/';
  link.href = base + theme + '.min.css';
  link.onerror = () => { link.href = base + 'github-dark.min.css'; };
}

// ---- Markdown render (re-render via IPC — used only when settings change) ----
async function renderMarkdown(mdText) {
  return window.mandy.renderMarkdown(mdText, currentFile);
}


// ---- View mode ----
function setViewMode(mode) {
  viewMode = mode;
  dom.viewer.classList.remove('mode-preview', 'mode-split', 'mode-edit');
  dom.viewer.classList.add(`mode-${mode}`);
  $$('.view-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));

  if (mode !== 'preview') {
    // preventScroll stops Chromium from jumping to the cursor position on focus
    dom.editorTextarea.focus({ preventScroll: true });
  }
  // Trigger a preview update when switching into split (content may differ from saved)
  if (mode === 'split' && hasUnsavedChanges) updatePreview();
}

// ---- Editor: live preview update ----
async function updatePreview() {
  const html = await renderMarkdown(dom.editorTextarea.value);
  dom.mdContent.innerHTML = html;
  addHeadingIds();
  buildTOC();
  updateProgress();
  updateScrollThumb();
  invalidateScrollAnchors(); // heading positions changed
}

// ---- Anchor-based split-view scroll sync ----
// We map headings in the editor to the same headings in the preview as fixed
// anchor points, then interpolate between them.
//
// The critical detail: editorY must be the VISUAL pixel position of each
// heading in the textarea, not `lineIndex * lineHeight`.  Long paragraphs
// wrap to multiple visual lines — a simple line-count formula misses this
// and causes the preview to jump ahead (overscroll).
//
// Solution: a hidden "mirror" div styled identically to the textarea renders
// the same text with the same wrapping, giving us accurate pixel heights.
let _scrollAnchors    = null;
let _scrollDriver     = null;   // 'editor' | 'preview' | null
let _scrollDriverTimer = null;

function invalidateScrollAnchors() { _scrollAnchors = null; }

function buildScrollAnchors() {
  const ta   = dom.editorTextarea;
  const sc   = dom.scrollContainer;
  const text = ta.value;
  const lines = text.split('\n');

  // 1. Find ATX headings in the source and their char offsets.
  const srcHeadings = [];
  let charOffset = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^#{1,6}\s+(.+)/);
    if (m) srcHeadings.push({ charOffset, text: m[1] });
    charOffset += lines[i].length + 1; // +1 for '\n'
  }

  // 2. Preview heading positions — absolute Y inside the scroll container.
  const scTop = sc.getBoundingClientRect().top;
  const norm  = s => s.toLowerCase().replace(/[`*_~[\]()]/g, '').replace(/\s+/g, ' ').trim();
  const prevHeadings = $$('h1,h2,h3,h4,h5,h6', dom.mdContent).map(h => ({
    y:    h.getBoundingClientRect().top - scTop + sc.scrollTop,
    text: norm(h.textContent),
  }));

  // 3. Match source headings → preview headings (sequential, by normalised text).
  const pairs = [];
  let pIdx = 0;
  for (const sh of srcHeadings) {
    if (pIdx >= prevHeadings.length) break;
    if (norm(sh.text) === prevHeadings[pIdx].text) {
      pairs.push({ charOffset: sh.charOffset, previewY: prevHeadings[pIdx].y });
      pIdx++;
    }
  }

  if (pairs.length === 0) {
    // No matching headings — fall back to simple % sync.
    return [
      { editorY: 0,                                        previewY: 0 },
      { editorY: Math.max(0, ta.scrollHeight - ta.clientHeight),
        previewY: Math.max(0, sc.scrollHeight - sc.clientHeight) },
    ];
  }

  // 4. Measure accurate visual Y positions with a mirror div.
  //    A mirror div styled like the textarea renders identical text with the
  //    same wrapping — its scrollHeight after filling with text up to a heading
  //    equals the pixel offset of that heading inside the textarea.
  const cs = getComputedStyle(ta);
  const mirror = document.createElement('div');
  Object.assign(mirror.style, {
    position:      'absolute',
    visibility:    'hidden',
    pointerEvents: 'none',
    left:          '-9999px',
    top:           '0',
    // box-sizing:border-box + width:clientWidth → same content width as textarea
    width:         ta.clientWidth + 'px',
    boxSizing:     'border-box',
    fontFamily:    cs.fontFamily,
    fontSize:      cs.fontSize,
    fontWeight:    cs.fontWeight,
    lineHeight:    cs.lineHeight,
    letterSpacing: cs.letterSpacing,
    paddingTop:    cs.paddingTop,
    paddingRight:  cs.paddingRight,
    paddingLeft:   cs.paddingLeft,
    paddingBottom: '0',          // omit bottom padding — we measure from the top
    whiteSpace:    'pre-wrap',
    wordBreak:     'break-word',
    overflowWrap:  'break-word',
  });
  document.body.appendChild(mirror);

  const anchors = [{ editorY: 0, previewY: 0 }];
  for (const p of pairs) {
    // Text BEFORE the heading → rendered height = Y where heading starts.
    mirror.textContent = text.slice(0, p.charOffset);
    anchors.push({ editorY: mirror.scrollHeight, previewY: p.previewY });
  }

  document.body.removeChild(mirror);

  anchors.push({
    editorY: Math.max(0, ta.scrollHeight - ta.clientHeight),
    previewY: Math.max(0, sc.scrollHeight - sc.clientHeight),
  });

  return anchors;
}

function getScrollAnchors() {
  if (!_scrollAnchors) _scrollAnchors = buildScrollAnchors();
  return _scrollAnchors;
}

// Piecewise linear interpolation through parallel arrays.
function mapScroll(val, from, to) {
  for (let i = 0; i < from.length - 1; i++) {
    if (val <= from[i + 1] || i === from.length - 2) {
      const span = from[i + 1] - from[i];
      const frac = span > 0 ? Math.min(1, Math.max(0, (val - from[i]) / span)) : 0;
      return to[i] + frac * (to[i + 1] - to[i]);
    }
  }
  return to[to.length - 1];
}

function syncEditorToPreview() {
  if (viewMode !== 'split' || _scrollDriver === 'preview') return;
  _scrollDriver = 'editor';
  clearTimeout(_scrollDriverTimer);
  _scrollDriverTimer = setTimeout(() => { _scrollDriver = null; }, 100);
  const a = getScrollAnchors();
  // 'instant' bypasses scroll-behavior:smooth — the smooth animation fires
  // scroll events for ~300 ms, outlasting the 100 ms driver timeout and
  // causing the preview to bounce the editor back ("pullback" jitter).
  dom.scrollContainer.scrollTo({
    top:      mapScroll(dom.editorTextarea.scrollTop, a.map(x => x.editorY),  a.map(x => x.previewY)),
    behavior: 'instant',
  });
}

function syncPreviewToEditor() {
  if (viewMode !== 'split' || _scrollDriver === 'editor') return;
  _scrollDriver = 'preview';
  clearTimeout(_scrollDriverTimer);
  _scrollDriverTimer = setTimeout(() => { _scrollDriver = null; }, 100);
  const a = getScrollAnchors();
  dom.editorTextarea.scrollTop = mapScroll(
    dom.scrollContainer.scrollTop,
    a.map(x => x.previewY),
    a.map(x => x.editorY),
  );
}

// ---- Editor: input handler ----
function handleEditorInput() {
  hasUnsavedChanges = true;
  updateUnsavedIndicator();
  updateEditorStatus();

  // Keep tab dot in sync (only re-render bar on first change)
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (activeTab && !activeTab.unsaved) {
    activeTab.unsaved = true;
    renderTabBar();
  }

  if (viewMode === 'split') {
    clearTimeout(previewUpdateTimer);
    previewUpdateTimer = setTimeout(updatePreview, 400);
  }
}

// ---- Editor: cursor/char status ----
function updateEditorStatus() {
  const ta = dom.editorTextarea;
  const text = ta.value;
  const pos = ta.selectionStart;
  const before = text.slice(0, pos);
  const lines = before.split('\n');
  const line = lines.length;
  const col = lines[lines.length - 1].length + 1;
  dom.editorPos.textContent = `Ln ${line}, Col ${col}`;
  dom.editorChars.textContent = `${text.length.toLocaleString()} ${t('chars')}`;
}

// ---- Unsaved indicator ----
function updateUnsavedIndicator() {
  dom.unsavedDot.classList.toggle('hidden', !hasUnsavedChanges);
}

// ---- Tab management ----
function createTab(data = {}) {
  const id = `tab-${++tabCounter}`;
  const tab = {
    id,
    path:          data.path    || null,
    name:          data.name    || 'untitled.md',
    content:       data.content || '',
    html:          data.html    || '',
    viewMode:      data.viewMode || viewMode || 'preview',
    unsaved:       data.unsaved || false,
    cursorStart:   0,
    cursorEnd:     0,
    editorScroll:  0,
    previewScroll: 0,
  };
  tabs.push(tab);
  return tab;
}

function saveActiveTabState() {
  const tab = tabs.find(t => t.id === activeTabId);
  if (!tab) return;
  // Note: closeFind() is always called before saveActiveTabState() in activateTab(),
  // so search marks are already gone. No need to call clearHighlights() again.
  tab.content       = dom.editorTextarea.value;
  tab.cursorStart   = dom.editorTextarea.selectionStart;
  tab.cursorEnd     = dom.editorTextarea.selectionEnd;
  tab.editorScroll  = dom.editorTextarea.scrollTop;
  tab.previewScroll = dom.scrollContainer.scrollTop;
  tab.viewMode      = viewMode;
  tab.unsaved       = hasUnsavedChanges;
  tab.html          = dom.mdContent.innerHTML;
}

function activateTab(tabId) {
  clearTimeout(previewUpdateTimer);
  _scrollDriver = null;
  closeFind();
  saveActiveTabState();

  activeTabId = tabId;
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;

  // Update globals
  currentFile       = tab.path;
  currentContent    = tab.content;
  hasUnsavedChanges = tab.unsaved;

  // Restore DOM
  dom.editorTextarea.value = tab.content;
  dom.editorTextarea.setSelectionRange(tab.cursorStart, tab.cursorEnd);
  dom.mdContent.innerHTML  = tab.html;

  dom.fileTitle.textContent   = tab.name;
  dom.docFilename.textContent = tab.name;
  dom.statusFile.textContent  = tab.path || '';

  // Word count
  if (cfg.showWordCount !== false && tab.content) {
    const words = countWords(tab.content);
    dom.docStats.words.textContent = `${words.toLocaleString()} ${t('words')}`;
    dom.docStats.read.textContent  = `~${Math.max(1, Math.round(words / 200))} ${t('minRead')}`;
    dom.docStats.chars.textContent = `${tab.content.length.toLocaleString()} ${t('chars')}`;
    $('#doc-meta').style.display = '';
  } else {
    $('#doc-meta').style.display = 'none';
  }

  // Welcome tab: empty, no path, not in edit mode → show welcome screen
  const isWelcomeTab = !tab.path && !tab.content && !tab.unsaved && tab.viewMode !== 'edit';
  dom.welcome.classList.toggle('hidden', !isWelcomeTab);
  dom.viewer.classList.toggle('hidden',   isWelcomeTab);

  updateUnsavedIndicator();
  setViewMode(tab.viewMode);
  invalidateScrollAnchors();
  addHeadingIds();
  buildTOC();
  updateProgress();
  updateScrollThumb();
  updateEditorStatus();

  requestAnimationFrame(() => {
    dom.editorTextarea.scrollTop = tab.editorScroll;
    dom.scrollContainer.scrollTo({ top: tab.previewScroll, behavior: 'instant' });
  });

  renderTabBar();

  // Mark active file in sidebar
  $$('.file-item').forEach(el => {
    el.classList.toggle('active', !!tab.path && el.dataset.path === tab.path);
  });
}

function renderTabBar() {
  const bar = $('#tab-bar');
  if (!bar) return;
  $$('.tab', bar).forEach(el => el.remove());
  const newBtn = $('#tab-new-btn');

  tabs.forEach(tab => {
    const el = document.createElement('div');
    el.className = 'tab' + (tab.id === activeTabId ? ' active' : '');
    el.dataset.tabId = tab.id;
    el.innerHTML =
      `<span class="tab-name">${escapeHtml(tab.name)}</span>` +
      `<span class="tab-dot${tab.unsaved ? '' : ' hidden'}">●</span>` +
      `<button class="tab-close" title="${t('tt.closeTab')}">×</button>`;
    el.addEventListener('click', e => {
      if (e.target.classList.contains('tab-close')) { closeTab(tab.id); return; }
      activateTab(tab.id);
    });
    bar.insertBefore(el, newBtn);
  });
}

async function closeTab(tabId) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;

  if (tab.unsaved) {
    // Activate the tab being closed so saveFile() targets it
    if (tabId !== activeTabId) activateTab(tabId);
    const dlg = {
      title:   t('dlg.unsaved.title'),
      message: t('dlg.unsaved.msg').replace('{name}', tab.name),
      detail:  t('dlg.unsaved.detail'),
      buttons: [t('dlg.unsaved.save'), t('dlg.unsaved.dontSave'), t('dlg.unsaved.cancel')],
    };
    const resp = await window.mandy.showUnsavedDialog(dlg);
    if (resp === 2) return;           // Cancel
    if (resp === 0) await saveFile(); // Save
  }

  const idx = tabs.findIndex(t => t.id === tabId);
  tabs.splice(idx, 1);

  if (tabs.length === 0) {
    activeTabId = null;
    currentFile = null;
    currentContent = '';
    hasUnsavedChanges = false;
    dom.viewer.classList.add('hidden');
    dom.welcome.classList.remove('hidden');
    renderTabBar();
    return;
  }

  const nextTab = tabs[Math.min(idx, tabs.length - 1)];
  activeTabId = null; // force full restore in activateTab
  activateTab(nextTab.id);
}

// ---- Save file ----
async function saveFile() {
  const activeTab = tabs.find(t => t.id === activeTabId);

  if (!currentFile) {
    const result = await window.mandy.showSaveDialog({ defaultPath: activeTab?.name || 'untitled.md' });
    if (result.canceled || !result.filePath) return;
    currentFile = result.filePath;
    const name = currentFile.split(/[\\/]/).pop();
    dom.fileTitle.textContent   = name;
    dom.docFilename.textContent = name;
    dom.statusFile.textContent  = currentFile;
    if (activeTab) { activeTab.path = currentFile; activeTab.name = name; }
    const recents = await window.mandy.addRecent(currentFile);
    updateRecentsList(recents);
    updateWelcomeRecents(recents);
  }

  const content = dom.editorTextarea.value;
  const result = await window.mandy.saveFile(currentFile, content);
  if (result.ok) {
    currentContent    = content;
    hasUnsavedChanges = false;
    if (activeTab) { activeTab.unsaved = false; activeTab.content = content; }
    updateUnsavedIndicator();
    renderTabBar();
    const recents = await window.mandy.addRecent(currentFile);
    updateRecentsList(recents);
    updateWelcomeRecents(recents);
    // Re-render preview with saved content
    const html = await renderMarkdown(content);
    dom.mdContent.innerHTML = html;
    if (activeTab) activeTab.html = html;
    addHeadingIds();
    buildTOC();
    // Update word count stats
    const words = countWords(content);
    dom.docStats.words.textContent = `${words.toLocaleString()} ${t('words')}`;
    dom.docStats.read.textContent  = `~${Math.max(1, Math.round(words / 200))} ${t('minRead')}`;
    dom.docStats.chars.textContent = `${content.length.toLocaleString()} ${t('chars')}`;
  } else {
    dom.statusPos.textContent = t('saveFailed');
    setTimeout(() => updateScrollPos(), 3000);
  }
}

// ---- Active format detection ----

function getLineInfo(text, pos) {
  const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
  const lineEndIdx = text.indexOf('\n', pos);
  const lineEnd = lineEndIdx === -1 ? text.length : lineEndIdx;
  return { lineStart, lineEnd, line: text.slice(lineStart, lineEnd), col: pos - lineStart };
}

// Find a symmetric inline marker (e.g. ** or ~~) containing the cursor.
// Returns { absOpen, absClose, markerLen } or null.
// absOpen  = absolute index of the opening marker's first char
// absClose = absolute index of the closing marker's first char
function findInlineMarker(text, pos, marker) {
  const { lineStart, line, col } = getLineInfo(text, pos);
  const ml = marker.length;
  const esc = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(esc + '.+?' + esc, 'gs');
  let m;
  while ((m = re.exec(line)) !== null) {
    if (col > m.index && col <= m.index + m[0].length) {
      return { absOpen: lineStart + m.index, absClose: lineStart + m.index + m[0].length - ml, markerLen: ml };
    }
  }
  return null;
}

// Find italic span (*...*) while ignoring ** (bold markers).
function findItalicMarker(text, pos) {
  const { lineStart, line, col } = getLineInfo(text, pos);
  const masked = line.replace(/\*\*/g, '\x00\x00');   // blank out bold markers
  const re = /\*[^*\x00]+?\*/g;
  let m;
  while ((m = re.exec(masked)) !== null) {
    if (col > m.index && col <= m.index + m[0].length) {
      return { absOpen: lineStart + m.index, absClose: lineStart + m.index + m[0].length - 1, markerLen: 1 };
    }
  }
  return null;
}

// Returns true when pos is between an opening ``` fence and its closing fence.
// Strategy: count ``` lines that appear strictly before pos in the source.
// An odd count means we are inside a block.
function isCursorInFencedCodeBlock(text, pos) {
  const before = text.slice(0, pos);
  const fences = (before.match(/^```/gm) || []).length;
  return fences % 2 === 1;
}

// Find the open/close fence pair enclosing pos.
// Returns { openStart, openEnd, closeStart, closeEnd } or null.
function findEnclosingFence(text, pos) {
  const lines = text.split('\n');
  const fences = [];
  let off = 0;
  for (const line of lines) {
    if (/^```/.test(line)) fences.push({ start: off, end: off + line.length });
    off += line.length + 1;
  }
  // Fences pair up: [0]=open,[1]=close,[2]=open,[3]=close …
  for (let i = 0; i + 1 < fences.length; i += 2) {
    const open = fences[i], close = fences[i + 1];
    if (pos >= open.start && pos <= close.end) return { openStart: open.start, openEnd: open.end, closeStart: close.start, closeEnd: close.end };
  }
  return null;
}

// Returns a Set of format-name strings active at the current cursor position.
function getActiveFormats() {
  const ta = dom.editorTextarea;
  const pos = ta.selectionStart;
  const text = ta.value;
  const { line } = getLineInfo(text, pos);
  const active = new Set();

  // Fenced code block takes priority — don't check inline formats inside one
  if (isCursorInFencedCodeBlock(text, pos)) {
    active.add('codeblock');
    return active;
  }

  // Line-level (most-specific first so ### wins over ##)
  if (/^### /.test(line))      active.add('h3');
  else if (/^## /.test(line))  active.add('h2');
  else if (/^# /.test(line))   active.add('h1');
  if (/^- /.test(line))        active.add('ul');
  if (/^\d+\. /.test(line))    active.add('ol');
  if (/^> /.test(line))        active.add('blockquote');

  // Inline
  if (findInlineMarker(text, pos, '**')) active.add('bold');
  if (findItalicMarker(text, pos))       active.add('italic');
  if (findInlineMarker(text, pos, '~~')) active.add('strikethrough');
  if (findInlineMarker(text, pos, '`'))  active.add('code');

  return active;
}

// Sync toolbar button highlight with cursor position.
function updateToolbarState() {
  const active = getActiveFormats();
  $$('.toolbar-btn[data-action]').forEach(btn => {
    btn.classList.toggle('active', active.has(btn.dataset.action));
  });
}

// ---- Format insertion / toggling ----
function applyFormat(type) {
  const ta = dom.editorTextarea;
  const pos = ta.selectionStart;
  const selEnd = ta.selectionEnd;
  const text = ta.value;
  const { lineStart, lineEnd, line, col } = getLineInfo(text, pos);
  const selected = text.slice(pos, selEnd);

  // Helper: strip any existing line-level prefix
  const stripPrefix = l => l.replace(/^(#{1,6} |- |\d+\. |> )/, '');

  // execCommand('insertText') is the only textarea write that integrates with
  // the native undo stack (Ctrl+Z). setRangeText/value assignment do not.
  // preventScroll: true stops Chromium from jumping the textarea when focus
  // returns from a toolbar button click.
  function exec(replaceText, selStart, selStop) {
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(selStart, selStop);
    document.execCommand('insertText', false, replaceText);
  }

  // Helper: commit a line-level replacement and reposition cursor
  function commitLine(newLine, oldPrefixLen, newPrefixLen) {
    exec(newLine, lineStart, lineEnd);
    const newPos = lineStart + newPrefixLen + Math.max(0, col - oldPrefixLen);
    ta.setSelectionRange(newPos, newPos);
    updateToolbarState();
  }

  // ---- Inline toggle-off ----
  const inlineFinders = {
    bold:          () => findInlineMarker(text, pos, '**'),
    italic:        () => findItalicMarker(text, pos),
    strikethrough: () => findInlineMarker(text, pos, '~~'),
    code:          () => findInlineMarker(text, pos, '`'),
  };
  if (type in inlineFinders) {
    const span = inlineFinders[type]();
    if (span) {
      const inner = text.slice(span.absOpen + span.markerLen, span.absClose);
      exec(inner, span.absOpen, span.absClose + span.markerLen);
      const newPos = Math.max(span.absOpen, Math.min(pos - span.markerLen, span.absOpen + inner.length));
      ta.setSelectionRange(newPos, newPos);
      updateToolbarState();
      return;
    }
  }

  // ---- Line-level toggle (headings, lists, blockquote) ----
  const stripped   = stripPrefix(line);
  const oldPrefLen = line.length - stripped.length;

  switch (type) {
    case 'h1': case 'h2': case 'h3': {
      const prefixes = { h1: '# ', h2: '## ', h3: '### ' };
      const prefix   = prefixes[type];
      const isActive = line.startsWith(prefix) && !line.startsWith(prefix + '#');
      commitLine(isActive ? stripped : prefix + stripped, oldPrefLen, isActive ? 0 : prefix.length);
      return;
    }
    case 'ul': {
      const isActive = /^- /.test(line);
      commitLine(isActive ? stripped : `- ${stripped}`, oldPrefLen, isActive ? 0 : 2);
      return;
    }
    case 'ol': {
      const isActive = /^\d+\. /.test(line);
      commitLine(isActive ? stripped : `1. ${stripped}`, oldPrefLen, isActive ? 0 : 3);
      return;
    }
    case 'blockquote': {
      const isActive = /^> /.test(line);
      commitLine(isActive ? stripped : `> ${stripped}`, oldPrefLen, isActive ? 0 : 2);
      return;
    }
    case 'codeblock': {
      // Toggle off: cursor is inside a fenced block — remove the fences.
      const fence = findEnclosingFence(text, pos);
      if (fence) {
        // Content sits between the end of the opening fence line and the
        // start of the closing fence line (strip the surrounding newlines).
        const contentStart = fence.openEnd + 1;              // char after opening \n
        const contentEnd   = Math.max(contentStart, fence.closeStart - 1); // char before closing \n
        const content      = text.slice(contentStart, contentEnd);
        exec(content, fence.openStart, fence.closeEnd);
        ta.setSelectionRange(fence.openStart, fence.openStart + content.length);
        return;
      }
      // Apply: insert a new fenced code block.
      const inner = selected || 'code';
      exec(`\`\`\`\n${inner}\n\`\`\``, pos, selEnd);
      ta.setSelectionRange(pos + 4, pos + 4 + inner.length);
      return;
    }
    case 'hr': {
      const ins = `\n\n---\n\n`;
      exec(ins, selEnd, selEnd);
      ta.setSelectionRange(selEnd + ins.length, selEnd + ins.length);
      return;
    }
  }

  // ---- Inline apply ----
  let newText, newStart, newEnd;
  switch (type) {
    case 'bold':
      newText = `**${selected || 'bold text'}**`;
      newStart = pos + 2; newEnd = pos + 2 + (selected.length || 9);
      break;
    case 'italic':
      newText = `*${selected || 'italic text'}*`;
      newStart = pos + 1; newEnd = pos + 1 + (selected.length || 11);
      break;
    case 'strikethrough':
      newText = `~~${selected || 'strikethrough'}~~`;
      newStart = pos + 2; newEnd = pos + 2 + (selected.length || 13);
      break;
    case 'code':
      newText = `\`${selected || 'code'}\``;
      newStart = pos + 1; newEnd = pos + 1 + (selected.length || 4);
      break;
    case 'link':
      newText = selected ? `[${selected}](url)` : `[link text](url)`;
      newStart = selected ? pos + selected.length + 3 : pos + 1;
      newEnd   = selected ? newStart + 3 : pos + 10;
      break;
    case 'image':
      newText = `![${selected || 'alt text'}](url)`;
      newStart = pos + 2; newEnd = pos + 2 + (selected.length || 8);
      break;
    default: return;
  }

  exec(newText, pos, selEnd);
  ta.setSelectionRange(newStart, newEnd);
}

// ---- Editor keyboard shortcuts ----
function setupEditorKeyboard() {
  dom.editorTextarea.addEventListener('keydown', e => {
    const mod = e.ctrlKey || e.metaKey;

    // Formatting shortcuts
    if (mod && e.key === 'b') { e.preventDefault(); applyFormat('bold'); return; }
    if (mod && e.key === 'i') { e.preventDefault(); applyFormat('italic'); return; }
    if (mod && e.key === 'k') { e.preventDefault(); applyFormat('link'); return; }
    if (mod && e.key === '`') { e.preventDefault(); applyFormat('code'); return; }

    // Tab → two spaces
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = dom.editorTextarea;
      const pos = ta.selectionStart;
      document.execCommand('insertText', false, '  ');
      ta.setSelectionRange(pos + 2, pos + 2);
      return;
    }

    // Smart Enter: continue list items
    if (e.key === 'Enter') {
      const ta = dom.editorTextarea;
      const pos = ta.selectionStart;
      const before = ta.value.slice(0, pos);
      const lines = before.split('\n');
      const currentLine = lines[lines.length - 1];

      const ulMatch = currentLine.match(/^(\s*)-\s+(.*)$/);
      const olMatch = currentLine.match(/^(\s*)(\d+)\.\s+(.*)$/);

      if (ulMatch) {
        e.preventDefault();
        if (!ulMatch[2]) {
          // Empty item → exit list: replace "- " on this line with a plain newline
          const lineStart = pos - currentLine.length;
          ta.setSelectionRange(lineStart, pos);
          document.execCommand('insertText', false, '\n');
        } else {
          const cont = `\n${ulMatch[1]}- `;
          document.execCommand('insertText', false, cont);
        }
        return;
      }

      if (olMatch) {
        e.preventDefault();
        if (!olMatch[3]) {
          const lineStart = pos - currentLine.length;
          ta.setSelectionRange(lineStart, pos);
          document.execCommand('insertText', false, '\n');
        } else {
          const cont = `\n${olMatch[1]}${parseInt(olMatch[2]) + 1}. `;
          document.execCommand('insertText', false, cont);
        }
        return;
      }
    }
  });

  dom.editorTextarea.addEventListener('input', handleEditorInput);
  dom.editorTextarea.addEventListener('scroll', syncEditorToPreview, { passive: true });
  dom.editorTextarea.addEventListener('click', () => { updateEditorStatus(); updateToolbarState(); });
  dom.editorTextarea.addEventListener('keyup', () => { updateEditorStatus(); updateToolbarState(); });
  // selectionchange fires on arrow-key navigation, mouse selection, etc.
  document.addEventListener('selectionchange', () => {
    if (document.activeElement === dom.editorTextarea) updateToolbarState();
  });
}

// ---- New file ----
function newWelcomeTab() {
  const tab = createTab({ name: 'New Tab', viewMode: 'preview' });
  activateTab(tab.id);
}

function newFile() {
  // If the active tab is already a welcome tab, convert it to an edit tab in-place
  const cur = tabs.find(t => t.id === activeTabId);
  if (cur && !cur.path && !cur.content && !cur.unsaved && cur.viewMode !== 'edit') {
    cur.name    = 'untitled.md';
    cur.viewMode = 'edit';
    activeTabId = null; // force full DOM restore
    activateTab(cur.id);
    return;
  }
  const tab = createTab({ viewMode: 'edit' });
  activateTab(tab.id);
}

// ---- File opening ----
async function openDocument(data) {
  const { path: filePath, name, content, html, recents } = data;

  // If file is already open in a tab, just switch to it
  const existing = tabs.find(t => t.path === filePath);
  if (existing) {
    activateTab(existing.id);
    if (recents) updateRecentsList(recents);
    return;
  }

  // Replace current tab only if it's untitled, unmodified, and empty
  const cur = tabs.find(t => t.id === activeTabId);
  let tab;
  if (cur && !cur.path && !cur.unsaved && cur.content === '') {
    Object.assign(cur, { path: filePath, name, content, html: html || '', viewMode: 'preview', unsaved: false });
    tab = cur;
    activeTabId = null; // force full restore
  } else {
    tab = createTab({ path: filePath, name, content, html: html || '', viewMode: 'preview' });
  }

  activateTab(tab.id);
  if (recents) updateRecentsList(recents);
  if (liveReload) window.mandy.watchFile(filePath);
}

function countWords(text) {
  return (text.match(/\b\w+\b/g) || []).length;
}

// ---- TOC ----
function buildTOC() {
  const headings = $$('h1,h2,h3,h4,h5,h6', dom.mdContent);
  dom.tocList.innerHTML = '';

  if (headings.length === 0) {
    dom.tocEmpty.classList.remove('hidden');
    return;
  }
  dom.tocEmpty.classList.add('hidden');

  headings.forEach(h => {
    const level = parseInt(h.tagName[1]);
    const item = document.createElement('a');
    item.className = 'toc-item';
    item.dataset.level = level;
    item.textContent = h.textContent;
    item.href = '#';
    item.onclick = (e) => {
      e.preventDefault();
      h.scrollIntoView({ behavior: 'smooth', block: 'start' });
      $$('.toc-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
    };
    dom.tocList.appendChild(item);
  });

  observeHeadings(headings);
}

function observeHeadings(headings) {
  if (!dom.scrollContainer) return;
  const io = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        $$('.toc-item').forEach(item => {
          item.classList.toggle('active', item.textContent === entry.target.textContent);
        });
        break;
      }
    }
  }, { root: dom.scrollContainer, rootMargin: '-10% 0px -80% 0px' });
  headings.forEach(h => io.observe(h));
}

// ---- Recents ----
function updateRecentsList(recents) {
  dom.recentsList.innerHTML = '';
  if (!recents || recents.length === 0) {
    dom.recentsEmpty.classList.remove('hidden');
    updateWelcomeRecents([]);
    return;
  }
  dom.recentsEmpty.classList.add('hidden');
  recents.forEach(r => {
    const item = createFileItem(r, () => window.mandy.openFileFromPath(r.path));
    dom.recentsList.appendChild(item);
  });
  updateWelcomeRecents(recents);
}

function updateWelcomeRecents(recents) {
  dom.welcomeRecents.innerHTML = '';
  if (!recents || recents.length === 0) return;
  recents.slice(0, 6).forEach(r => {
    const el = document.createElement('div');
    el.className = 'welcome-recent-item';
    el.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
      <span class="wri-name">${escapeHtml(r.name)}</span>
      <span class="wri-path">${escapeHtml(r.path)}</span>
    `;
    el.onclick = () => window.mandy.openFileFromPath(r.path);
    dom.welcomeRecents.appendChild(el);
  });
}

function createFileItem(r, onClick) {
  const div = document.createElement('div');
  div.className = 'file-item';
  div.dataset.path = r.path;
  if (r.path === currentFile) div.classList.add('active');

  const date = r.opened ? relativeTime(r.opened) : '';
  div.innerHTML = `
    <svg class="file-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
    </svg>
    <div class="file-info">
      <div class="file-name">${escapeHtml(r.name)}</div>
      <div class="file-path" title="${escapeHtml(r.path)}">${escapeHtml(r.path)}</div>
      ${date ? `<div class="file-date">${date}</div>` : ''}
    </div>
    <button class="file-remove" title="${t('tt.removeRecent')}" data-path="${escapeHtml(r.path)}">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 6L6 18M6 6l12 12"/>
      </svg>
    </button>
  `;

  div.addEventListener('click', (e) => {
    if (!e.target.closest('.file-remove')) onClick();
  });

  div.querySelector('.file-remove').addEventListener('click', async (e) => {
    e.stopPropagation();
    const p = e.currentTarget.dataset.path;
    const updated = await window.mandy.removeRecent(p);
    updateRecentsList(updated);
  });

  return div;
}

function relativeTime(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1) return t('justNow');
  if (m < 60) return `${m}${t('mAgo')}`;
  if (h < 24) return `${h}${t('hAgo')}`;
  if (d < 7) return `${d}${t('dAgo')}`;
  return new Date(ts).toLocaleDateString();
}

function escapeHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ---- Folder tree ----
async function openFolder(folderPath) {
  const tree = await window.mandy.readFolder(folderPath);
  dom.folderList.innerHTML = '';
  loadedFolderPath = folderPath;
  loadedFolderName = folderPath.split(/[/\\]/).pop();
  dom.folderName.textContent = loadedFolderName;

  if (!tree || tree.length === 0) {
    dom.folderEmpty.classList.remove('hidden');
    return;
  }
  dom.folderEmpty.classList.add('hidden');
  dom.folderList.appendChild(buildTree(tree, 0));
  switchTab('folder');
}

function buildTree(nodes, depth) {
  const group = document.createElement('div');
  group.className = 'tree-group';

  for (const node of nodes) {
    if (node.type === 'dir') {
      group.appendChild(buildDirNode(node, depth));
    } else {
      group.appendChild(buildFileNode(node, depth));
    }
  }
  return group;
}

function buildDirNode(node, depth) {
  const wrap = document.createElement('div');
  wrap.className = 'tree-dir';
  wrap.dataset.path = node.path;

  const header = document.createElement('div');
  header.className = 'tree-dir-header';
  header.style.paddingLeft = (depth * 14 + 8) + 'px';
  header.innerHTML = `
    <svg class="tree-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <path d="M9 18l6-6-6-6"/>
    </svg>
    <svg class="tree-folder-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
    <span class="tree-dir-name" title="${escapeHtml(node.name)}">${escapeHtml(node.name)}</span>
    <span class="tree-dir-actions">
      <button class="tree-action-btn" data-action="new-file" title="${t('tt.newFile')}">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
          <line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
        </svg>
      </button>
      <button class="tree-action-btn" data-action="new-folder" title="${t('tt.newFolder')}">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          <line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
        </svg>
      </button>
      <button class="tree-action-btn" data-action="delete-folder" title="${t('tt.delete')}">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
          <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
        </svg>
      </button>
    </span>
  `;

  const children = buildTree(node.children, depth + 1);

  header.querySelector('[data-action="new-file"]').addEventListener('click', e => {
    e.stopPropagation();
    wrap.classList.add('open');
    startInlineCreate('file', node.path, children);
  });
  header.querySelector('[data-action="new-folder"]').addEventListener('click', e => {
    e.stopPropagation();
    wrap.classList.add('open');
    startInlineCreate('folder', node.path, children);
  });
  header.querySelector('[data-action="delete-folder"]').addEventListener('click', async e => {
    e.stopPropagation();
    const deleted = await window.mandy.deleteItem(node.path);
    if (!deleted) return;
    const norm = node.path.replace(/\\/g, '/');
    for (const tab of [...tabs]) {
      if (tab.path && tab.path.replace(/\\/g, '/').startsWith(norm + '/')) {
        await closeTab(tab.id);
      }
    }
    const expanded = new Set([...$$('.tree-dir.open', dom.folderList)].map(el => el.dataset.path));
    await openFolder(loadedFolderPath);
    $$('.tree-dir', dom.folderList).forEach(el => { if (expanded.has(el.dataset.path)) el.classList.add('open'); });
  });
  header.addEventListener('click', e => {
    if (!e.target.closest('.tree-dir-actions')) wrap.classList.toggle('open');
  });

  wrap.appendChild(header);
  wrap.appendChild(children);
  return wrap;
}

function startInlineCreate(type, parentPath, groupEl) {
  const existing = groupEl.querySelector('.tree-inline-create');
  if (existing) { existing.querySelector('input').focus(); return; }

  const row = document.createElement('div');
  row.className = 'tree-inline-create';
  const icon = type === 'file'
    ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`
    : `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
  row.innerHTML = `${icon}<input class="tree-inline-input" type="text" placeholder="${t(type === 'file' ? 'folder.newFilePh' : 'folder.newFolderPh')}" spellcheck="false"/>`;
  groupEl.prepend(row);

  const input = row.querySelector('input');
  input.focus();

  let committed = false;
  async function commit() {
    let name = input.value.trim();
    if (!name) { row.remove(); return; }
    if (type === 'file') {
      const validExt = /\.(md|txt)$/i;
      if (!validExt.test(name)) {
        // default to .md if no valid extension given
        name = name.replace(/\.[^.]*$/, '') || name;
        name = name + '.md';
        input.value = name;
      }
    }
    committed = true;
    try {
      const fullPath = type === 'file'
        ? await window.mandy.createFile(parentPath, name)
        : await window.mandy.createFolder(parentPath, name);
      const expanded = new Set([...$$('.tree-dir.open', dom.folderList)].map(el => el.dataset.path));
      expanded.add(parentPath); // ensure the parent stays open
      await openFolder(loadedFolderPath);
      $$('.tree-dir', dom.folderList).forEach(el => { if (expanded.has(el.dataset.path)) el.classList.add('open'); });
      if (type === 'file') window.mandy.openFileFromPath(fullPath);
    } catch (err) {
      committed = false;
      input.select();
    }
  }

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { row.remove(); }
  });
  input.addEventListener('blur', () => { if (!committed) setTimeout(() => row.remove(), 120); });
}

function buildFileNode(node, depth) {
  const div = document.createElement('div');
  div.className = 'file-item tree-file' + (node.markdown ? '' : ' tree-file-other');
  div.dataset.path = node.path;
  if (node.path === currentFile) div.classList.add('active');
  div.style.paddingLeft = (depth * 14 + 8) + 'px';
  div.innerHTML = `
    <svg class="file-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
    </svg>
    <div class="file-info">
      <div class="file-name" title="${escapeHtml(node.name)}">${escapeHtml(node.name)}</div>
    </div>
    <button class="file-remove" title="${t('tt.delete')}">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
        <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
      </svg>
    </button>
  `;
  div.querySelector('.file-remove').addEventListener('click', async e => {
    e.stopPropagation();
    const deleted = await window.mandy.deleteItem(node.path);
    if (!deleted) return;
    // Close any open tab for this file
    const tab = tabs.find(t => t.path === node.path);
    if (tab) await closeTab(tab.id);
    // Remove from recents
    window.mandy.removeRecent(node.path);
    // Refresh tree preserving expanded state
    const expanded = new Set([...$$('.tree-dir.open', dom.folderList)].map(el => el.dataset.path));
    await openFolder(loadedFolderPath);
    $$('.tree-dir', dom.folderList).forEach(el => { if (expanded.has(el.dataset.path)) el.classList.add('open'); });
  });
  div.onclick = () => node.markdown
    ? window.mandy.openFileFromPath(node.path)
    : window.mandy.handleLink(node.path, null);
  return div;
}

// ---- Sidebar tabs ----
function switchTab(tabName) {
  $$('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
  $$('.tab-content').forEach(c => {
    if (c.id === `tab-${tabName}`) { c.classList.add('active'); c.classList.remove('hidden'); }
    else { c.classList.remove('active'); c.classList.add('hidden'); }
  });
}

// ---- Progress & scroll ----
function updateProgress() {
  const sc = dom.scrollContainer;
  const pct = sc.scrollHeight <= sc.clientHeight ? 0
    : (sc.scrollTop / (sc.scrollHeight - sc.clientHeight)) * 100;
  dom.progressFill.style.width = pct + '%';
  updateScrollPos();
}

function updateScrollPos() {
  const sc = dom.scrollContainer;
  const approx = Math.floor(sc.scrollTop / (parseFloat(cfg.fontSize || 18) * parseFloat(cfg.lineHeight || 1.8)));
  dom.statusPos.textContent = `Ln ${approx}`;
}

function updateScrollThumb() {
  const sc       = dom.scrollContainer;
  const indicator = dom.scrollThumb.parentElement;
  if (sc.scrollHeight <= sc.clientHeight) { dom.scrollThumb.style.height = '0'; return; }
  const trackH  = indicator.clientHeight || sc.clientHeight;
  const thumbH  = Math.max(30, (sc.clientHeight / sc.scrollHeight) * trackH);
  const thumbTop = (sc.scrollTop / (sc.scrollHeight - sc.clientHeight)) * (trackH - thumbH);
  dom.scrollThumb.style.height = thumbH + 'px';
  dom.scrollThumb.style.top    = thumbTop + 'px';
}

// ---- Preview context menu ----

// Converts a DOM node (fragment from a selection) back to approximate Markdown.
function htmlToMd(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const tag   = node.tagName.toLowerCase();
  const inner = () => Array.from(node.childNodes).map(htmlToMd).join('');

  switch (tag) {
    case 'strong': case 'b':   return `**${inner()}**`;
    case 'em':     case 'i':   return `*${inner()}*`;
    case 'del':    case 's':   return `~~${inner()}~~`;
    case 'code':
      // inline code (not inside a pre)
      if (node.closest('pre')) return node.textContent;
      return `\`${node.textContent}\``;
    case 'a':
      return `[${inner()}](${node.getAttribute('href') || ''})`;
    case 'h1': return `# ${inner()}\n\n`;
    case 'h2': return `## ${inner()}\n\n`;
    case 'h3': return `### ${inner()}\n\n`;
    case 'h4': return `#### ${inner()}\n\n`;
    case 'h5': return `##### ${inner()}\n\n`;
    case 'h6': return `###### ${inner()}\n\n`;
    case 'p':  return `${inner()}\n\n`;
    case 'br': return '\n';
    case 'li': return `- ${inner().replace(/\n+$/, '')}\n`;
    case 'ul': case 'ol': return inner();
    case 'blockquote':
      return inner().trim().split('\n').map(l => `> ${l}`).join('\n') + '\n\n';
    case 'pre': {
      const codeEl = node.querySelector('code');
      const lang   = (codeEl?.className || '').match(/language-(\S+)/)?.[1] || '';
      const text   = codeEl ? codeEl.textContent : node.textContent;
      return `\`\`\`${lang}\n${text.replace(/\n$/, '')}\n\`\`\`\n\n`;
    }
    case 'hr': return `---\n\n`;
    case 'img':
      return `![${node.getAttribute('alt') || ''}](${node.getAttribute('src') || ''})`;
    default:   return inner();
  }
}

(function initContextMenu() {
  const menu          = document.getElementById('preview-context-menu');
  const btnMd         = document.getElementById('cm-copy-md');
  const btnText       = document.getElementById('cm-copy-text');
  const btnFind       = document.getElementById('cm-find');
  const btnFindEditor = document.getElementById('cm-find-editor');

  function hideMenu() { menu.classList.add('hidden'); }

  function showMenu(x, y, hasSelection) {
    btnMd.disabled         = !hasSelection;
    btnText.disabled       = !hasSelection;
    btnFind.disabled       = !hasSelection;
    btnFindEditor.disabled = !hasSelection;

    // Position, then clamp so it doesn't overflow the viewport
    menu.classList.remove('hidden');
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    menu.style.left = Math.min(x, window.innerWidth  - mw - 4) + 'px';
    menu.style.top  = Math.min(y, window.innerHeight - mh - 4) + 'px';
  }

  dom.mdContent.addEventListener('contextmenu', e => {
    // Available in preview and split modes (not edit, where the preview pane is hidden)
    if (viewMode === 'edit') return;
    e.preventDefault();
    const sel = window.getSelection();
    showMenu(e.clientX, e.clientY, sel && !sel.isCollapsed);
  });

  btnMd.onclick = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) { hideMenu(); return; }
    const range    = sel.getRangeAt(0);
    const fragment = range.cloneContents();
    const wrapper  = document.createElement('div');
    wrapper.appendChild(fragment);
    navigator.clipboard.writeText(htmlToMd(wrapper).trim());
    hideMenu();
  };

  btnText.onclick = () => {
    const text = window.getSelection()?.toString() || '';
    if (text) navigator.clipboard.writeText(text);
    hideMenu();
  };

  // "Find in Document" — opens find bar pre-filled with the selection
  btnFind.onclick = () => {
    const text = window.getSelection()?.toString()?.trim() || '';
    hideMenu();
    openFind(text || undefined);
  };

  // "Find in Editor" — switches to split view and selects the text in the textarea
  btnFindEditor.onclick = () => {
    const text = window.getSelection()?.toString() || '';
    hideMenu();
    if (!text) return;

    const src = dom.editorTextarea.value;
    const idx = src.toLowerCase().indexOf(text.toLowerCase());
    if (idx === -1) return;

    // Switch to split so the user sees both panes
    setViewMode('split');

    // Select the match in the textarea and scroll to it
    dom.editorTextarea.focus({ preventScroll: true });
    dom.editorTextarea.setSelectionRange(idx, idx + text.length);

    // Scroll the textarea so the selection is vertically centred
    const lineH    = parseFloat(getComputedStyle(dom.editorTextarea).lineHeight) || 24;
    const lines    = src.substring(0, idx).split('\n').length - 1;
    const targetY  = lines * lineH;
    dom.editorTextarea.scrollTop = Math.max(0, targetY - dom.editorTextarea.clientHeight / 2);
  };

  // Dismiss on any click outside the menu or on Escape
  document.addEventListener('mousedown', e => {
    if (!menu.classList.contains('hidden') && !menu.contains(e.target)) hideMenu();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !menu.classList.contains('hidden')) { hideMenu(); e.stopPropagation(); }
  }, true);
})();

(function initEditorContextMenu() {
  const menu = document.getElementById('editor-context-menu');
  const ta   = dom.editorTextarea;

  function hideMenu() { menu.classList.add('hidden'); }

  function showMenu(x, y) {
    menu.classList.remove('hidden');
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    menu.style.left = Math.min(x, window.innerWidth  - mw - 4) + 'px';
    menu.style.top  = Math.min(y, window.innerHeight - mh - 4) + 'px';
  }

  ta.addEventListener('contextmenu', e => {
    e.preventDefault();
    showMenu(e.clientX, e.clientY);
  });

  document.getElementById('ecm-cut').onclick = () => {
    ta.focus();
    document.execCommand('cut');
    hideMenu();
  };

  document.getElementById('ecm-copy').onclick = () => {
    ta.focus();
    document.execCommand('copy');
    hideMenu();
  };

  document.getElementById('ecm-paste').onclick = () => {
    navigator.clipboard.readText().then(text => {
      const s = ta.selectionStart, e2 = ta.selectionEnd;
      ta.value = ta.value.slice(0, s) + text + ta.value.slice(e2);
      ta.selectionStart = ta.selectionEnd = s + text.length;
      ta.dispatchEvent(new Event('input'));
    });
    hideMenu();
  };

  document.getElementById('ecm-find').onclick = () => {
    const text = ta.value.slice(ta.selectionStart, ta.selectionEnd).trim();
    hideMenu();
    openFind(text || undefined);
  };

  document.addEventListener('mousedown', e => {
    if (!menu.classList.contains('hidden') && !menu.contains(e.target)) hideMenu();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !menu.classList.contains('hidden')) { hideMenu(); e.stopPropagation(); }
  }, true);
})();

// ---- Find ----
let findTimeout;

function openFind(query) {
  dom.findBar.classList.remove('hidden');
  if (query) {
    dom.findInput.value = query;
    doFind(query);
    dom.findInput.focus();
  } else {
    dom.findInput.focus();
    dom.findInput.select();
  }
}

function closeFind() {
  dom.findBar.classList.add('hidden');
  clearHighlights();
  findMatches = [];
  findIndex = 0;
  dom.findCount.textContent = '';
}

function doFind(query) {
  clearHighlights();
  findMatches = [];
  findIndex = 0;

  if (!query || !query.trim()) { dom.findCount.textContent = ''; return; }

  // Use TreeWalker for efficiency
  const treeWalker = document.createTreeWalker(dom.mdContent, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  let node;
  while ((node = treeWalker.nextNode())) textNodes.push(node);

  const q = query.toLowerCase();
  // Process in reverse to preserve offsets
  const hits = [];
  textNodes.forEach(n => {
    const text = n.textContent;
    const lower = text.toLowerCase();
    let idx = 0;
    while ((idx = lower.indexOf(q, idx)) !== -1) {
      hits.push({ node: n, start: idx, end: idx + q.length });
      idx += q.length;
    }
  });

  // Wrap each hit in a mark (reverse order)
  [...hits].reverse().forEach(m => {
    try {
      const range = document.createRange();
      range.setStart(m.node, m.start);
      range.setEnd(m.node, m.end);
      const mark = document.createElement('mark');
      mark.className = 'search-hit';
      range.surroundContents(mark);
    } catch {}
  });

  findMatches = $$('mark.search-hit', dom.mdContent);
  dom.findCount.textContent = findMatches.length > 0 ? `1 / ${findMatches.length}` : t('noResults');

  if (findMatches.length > 0) {
    findIndex = 0;
    highlightCurrent();
  }
}

function highlightCurrent() {
  $$('mark.search-hit').forEach(m => m.classList.remove('current'));
  if (findMatches.length === 0) return;
  const cur = findMatches[findIndex];
  cur.classList.add('current');
  cur.scrollIntoView({ behavior: 'smooth', block: 'center' });
  dom.findCount.textContent = `${findIndex + 1} / ${findMatches.length}`;
}

function clearHighlights() {
  $$('mark.search-hit', dom.mdContent).forEach(m => {
    const parent = m.parentNode;
    if (parent) {
      parent.replaceChild(document.createTextNode(m.textContent), m);
      parent.normalize();
    }
  });
}

function findNav(dir) {
  if (findMatches.length === 0) return;
  findIndex = (findIndex + dir + findMatches.length) % findMatches.length;
  highlightCurrent();
}

// ---- Settings ----
function openSettings() {
  dom.settingsOverlay.classList.remove('hidden');
  syncSettingsUI();
}

function closeSettings() {
  dom.settingsOverlay.classList.add('hidden');
}

function syncSettingsUI() {
  $$('.theme-btn').forEach(b => b.classList.toggle('active', b.dataset.theme === cfg.theme));
  $$('.font-btn').forEach(b => b.classList.toggle('active', b.dataset.font === cfg.fontFamily));
  $$('.palette-btn').forEach(b => b.classList.toggle('active', b.dataset.palette === (cfg.palette || 'amber')));
  const langEl = $('#cfg-language');
  if (langEl) langEl.value = cfg.language || 'en';
  $('#cfg-font-size').value = cfg.fontSize || 18;
  $('#val-font-size').textContent = (cfg.fontSize || 18) + 'px';
  $('#cfg-line-height').value = cfg.lineHeight || 1.8;
  $('#val-line-height').textContent = (cfg.lineHeight || 1.8).toFixed(2);
  $('#cfg-content-width').value = cfg.contentWidth ?? 80;
  $('#val-content-width').textContent = (cfg.contentWidth ?? 80) + '%';
  $('#cfg-code-theme').value = cfg.codeTheme || 'github-dark';
  $('#cfg-live-reload').checked = liveReload;
  $('#cfg-word-count').checked = cfg.showWordCount !== false;
  $('#cfg-smooth-scroll').checked = cfg.smoothScroll !== false;
}

function applyConfig() {
  dom.body.dataset.theme = cfg.theme || 'dark';
  dom.body.dataset.font = cfg.fontFamily || 'serif';
  const pal = cfg.palette || 'amber';
  if (pal === 'amber') delete dom.body.dataset.palette;
  else dom.body.dataset.palette = pal;
  const fs = (cfg.fontSize || 18) + 'px';
  const lh = cfg.lineHeight || 1.8;
  // Migrate legacy px values (> 100 means old px-based setting)
  if ((cfg.contentWidth || 0) > 100) cfg.contentWidth = 80;
  const cw = (cfg.contentWidth ?? 80) + '%';
  document.documentElement.style.setProperty('--font-size', fs);
  document.documentElement.style.setProperty('--line-height', lh);
  document.documentElement.style.setProperty('--content-width', cw);
  dom.mdContent.style.fontSize = fs;
  dom.mdContent.style.lineHeight = lh;
  dom.scrollContainer.classList.toggle('no-smooth', !cfg.smoothScroll);
  applyHljsTheme(cfg.codeTheme || 'github-dark'); // fire-and-forget, CSS injection
}

// Auto-save: debounced, called after every control change
let _saveTimer;
function autosave() {
  cfg.theme        = $('button.theme-btn.active')?.dataset.theme    || cfg.theme;
  cfg.fontFamily   = $('button.font-btn.active')?.dataset.font      || cfg.fontFamily;
  cfg.palette      = $('button.palette-btn.active')?.dataset.palette || cfg.palette || 'amber';
  cfg.language     = $('#cfg-language')?.value                       || cfg.language || 'en';
  cfg.fontSize     = parseInt($('#cfg-font-size').value)             || 18;
  cfg.lineHeight   = parseFloat($('#cfg-line-height').value)         || 1.8;
  cfg.contentWidth = parseInt($('#cfg-content-width').value)         ?? 80;
  cfg.codeTheme    = $('#cfg-code-theme').value;
  cfg.showWordCount = $('#cfg-word-count').checked;
  cfg.smoothScroll  = $('#cfg-smooth-scroll').checked;
  liveReload       = $('#cfg-live-reload').checked;
  cfg.liveReload   = liveReload;

  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => window.mandy.saveConfig(cfg), 400);
}

// ---- Zoom ----
function applyZoom(z) {
  cfg.zoom = Math.min(2.0, Math.max(0.5, parseFloat(z.toFixed(1))));
  document.body.style.zoom = cfg.zoom;
}

// ---- Focus mode ----
function toggleFocus() {
  dom.body.classList.toggle('focus-mode');
}

// ---- Sidebar toggle ----
function toggleSidebar(forceOpen = false) {
  if (forceOpen && !dom.sidebar.classList.contains('hidden')) return;
  if (forceOpen) { dom.sidebar.classList.remove('hidden'); return; }
  dom.sidebar.classList.toggle('hidden');
}

// ---- Copy code (accessible from HTML onclick) ----
window.__copyCode = function(btn) {
  const code = btn.closest('.code-block-wrap').querySelector('code');
  if (!code) return;
  navigator.clipboard.writeText(code.textContent).then(() => {
    const orig = btn.innerHTML;
    btn.textContent = t('copied');
    btn.classList.add('copied');
    setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('copied'); }, 2000);
  }).catch(() => {});
};

// ---- Drag and drop ----
function setupDragDrop() {
  const overlay = document.createElement('div');
  overlay.id = 'drop-overlay';
  overlay.innerHTML = `
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
    <p data-i18n="drop.title">Drop to open</p>
    <span data-i18n="drop.sub">Markdown &amp; text files accepted</span>
  `;
  document.body.appendChild(overlay);

  let dragCount = 0;
  document.addEventListener('dragenter', () => { dragCount++; overlay.classList.add('active'); });
  document.addEventListener('dragleave', () => { if (--dragCount <= 0) { dragCount = 0; overlay.classList.remove('active'); } });
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', async e => {
    e.preventDefault();
    dragCount = 0;
    overlay.classList.remove('active');
    const file = e.dataTransfer.files[0];
    if (file && file.path) window.mandy.openFileFromPath(file.path);
  });
}

// ---- Platform ----
async function detectPlatform() {
  const platform = await window.mandy.getPlatform();
  dom.body.classList.add(`platform-${platform}`);
  if (platform === 'darwin') {
    document.getElementById('titlebar').style.paddingLeft = '80px';
    document.getElementById('win-controls').style.display = 'none';
  }
}

// ---- Window controls ----
function setupWindowControls() {
  $('#btn-min').onclick = () => window.mandy.minimize();
  $('#btn-max').onclick = () => window.mandy.maximize();
  $('#btn-close').onclick = () => window.mandy.close();
  window.mandy.onWindowState(() => {});
}

// ---- Keyboard shortcuts ----
function setupKeyboard() {
  document.addEventListener('keydown', e => {
    const mod = e.ctrlKey || e.metaKey;
    const inEditor = document.activeElement === dom.editorTextarea;

    // Tab management
    if (mod && e.key === 'w') { e.preventDefault(); closeTab(activeTabId); return; }
    if (mod && e.key === 't') { e.preventDefault(); newWelcomeTab(); return; }
    if (mod && e.key === 'Tab') {
      e.preventDefault();
      if (tabs.length < 2) return;
      const idx = tabs.findIndex(t => t.id === activeTabId);
      if (idx === -1) return;
      const next = e.shiftKey
        ? (idx - 1 + tabs.length) % tabs.length
        : (idx + 1) % tabs.length;
      activateTab(tabs[next].id);
      return;
    }

    if (mod && e.key === 'o') { e.preventDefault(); window.mandy.openFileDialog(); }
    if (mod && e.key === 'n') { e.preventDefault(); newFile(); }
    if (mod && e.key === 's') { e.preventDefault(); saveFile(); }
    if (mod && e.key === ',') { e.preventDefault(); openSettings(); }
    // Ctrl+F: open find; in editor, pre-fill with the current selection
    if (mod && e.key === 'f') {
      e.preventDefault();
      const sel = inEditor
        ? dom.editorTextarea.value.slice(dom.editorTextarea.selectionStart, dom.editorTextarea.selectionEnd).trim()
        : (window.getSelection()?.toString()?.trim() || '');
      openFind(sel || undefined);
    }
    if (mod && e.key === 'b' && !inEditor) { e.preventDefault(); toggleSidebar(); }
    if (mod && e.key === '=' && !inEditor) { e.preventDefault(); applyZoom((cfg.zoom || 1) + 0.1); }
    if (mod && e.key === '-' && !inEditor) { e.preventDefault(); applyZoom((cfg.zoom || 1) - 0.1); }
    if (mod && e.key === '0' && !inEditor) { e.preventDefault(); applyZoom(1); }
    if (mod && e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); toggleFocus(); }
    // View mode shortcuts
    if (mod && e.key === 'e' && !e.shiftKey) { e.preventDefault(); setViewMode(viewMode === 'edit' ? 'preview' : 'edit'); }
    if (mod && e.shiftKey && e.key.toLowerCase() === 'e') { e.preventDefault(); setViewMode('split'); }
    if (mod && e.shiftKey && e.key.toLowerCase() === 'p') { e.preventDefault(); setViewMode('preview'); }

    if (e.key === 'Escape') {
      if (!dom.settingsOverlay.classList.contains('hidden')) { closeSettings(); return; }
      if (!dom.findBar.classList.contains('hidden')) { closeFind(); return; }
      if (inEditor && viewMode === 'edit') { setViewMode('preview'); return; }
    }
    if (!dom.findBar.classList.contains('hidden')) {
      if (e.key === 'Enter') { e.shiftKey ? findNav(-1) : findNav(1); }
      if (e.key === 'F3') { e.preventDefault(); e.shiftKey ? findNav(-1) : findNav(1); }
    }
  });
}

// ---- Main init ----
async function init() {
  cfg = await window.mandy.getConfig();
  liveReload = cfg.liveReload ?? true;

  applyConfig();
  setLanguage(cfg.language || 'en');
  await detectPlatform();
  setupWindowControls();
  setupKeyboard();
  setupEditorKeyboard();
  setupDragDrop();

  // Load recents
  const recents = await window.mandy.getRecents();
  updateRecentsList(recents);

  // Sidebar tabs
  $$('.tab-btn').forEach(btn => btn.onclick = () => switchTab(btn.dataset.tab));

  // Sidebar toggle button
  $('#sidebar-toggle').onclick = () => toggleSidebar();

  // Sidebar resize handle
  (function() {
    const resizer = $('#sidebar-resizer');
    let startX, startW;
    resizer.addEventListener('mousedown', e => {
      startX = e.clientX;
      startW = dom.sidebar.offsetWidth;
      resizer.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      function onMove(e) {
        const w = Math.min(480, Math.max(160, startW + (e.clientX - startX)));
        document.documentElement.style.setProperty('--sidebar-w', w + 'px');
      }
      function onUp() {
        resizer.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        const w = dom.sidebar.offsetWidth;
        cfg.sidebarWidth = w;
        autosave();
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    // Restore saved sidebar width
    if (cfg.sidebarWidth) {
      document.documentElement.style.setProperty('--sidebar-w', cfg.sidebarWidth + 'px');
    }
  })();

  // Titlebar buttons
  $('#btn-find').onclick = openFind;
  $('#btn-settings').onclick = openSettings;
  $('#btn-open-file').onclick = () => window.mandy.openFileDialog();
  $('#btn-open-folder').onclick = () => window.mandy.openFolderDialog();
  $('#tab-new-btn').onclick = () => newWelcomeTab();

  // Welcome buttons
  $('#welcome-open').onclick = () => window.mandy.openFileDialog();
  $('#welcome-folder').onclick = () => window.mandy.openFolderDialog();
  $('#welcome-new').onclick = () => newFile();

  // Find bar
  dom.findInput.addEventListener('input', () => {
    clearTimeout(findTimeout);
    findTimeout = setTimeout(() => doFind(dom.findInput.value), 180);
  });
  $('#find-prev').onclick = () => findNav(-1);
  $('#find-next').onclick = () => findNav(1);
  $('#find-close').onclick = closeFind;

  // Settings
  $('#settings-close').onclick = closeSettings;
  $('#settings-reset').onclick = () => {
    cfg = { theme:'dark', fontFamily:'sans', fontSize:18, lineHeight:1.8, contentWidth:80, codeTheme:'github-dark', showWordCount:true, smoothScroll:true, zoom:1, liveReload:true, palette:'amber', language:'en' };
    liveReload = false;
    setLanguage('en');
    applyConfig();
    syncSettingsUI();
    window.mandy.saveConfig(cfg);
    if (currentContent) { renderMarkdown(currentContent).then(h => { dom.mdContent.innerHTML = h; buildTOC(); }); }
  };
  dom.settingsOverlay.onclick = e => { if (e.target === dom.settingsOverlay) closeSettings(); };

  // Settings — live apply on every change
  $('#cfg-font-size').oninput = function() {
    const v = parseInt(this.value);
    $('#val-font-size').textContent = v + 'px';
    document.documentElement.style.setProperty('--font-size', v + 'px');
    dom.mdContent.style.fontSize = v + 'px';
    autosave();
  };
  $('#cfg-line-height').oninput = function() {
    const v = parseFloat(this.value);
    $('#val-line-height').textContent = v.toFixed(2);
    document.documentElement.style.setProperty('--line-height', v);
    dom.mdContent.style.lineHeight = v;
    autosave();
  };
  $('#cfg-content-width').oninput = function() {
    const v = parseInt(this.value);
    $('#val-content-width').textContent = v + '%';
    document.documentElement.style.setProperty('--content-width', v + '%');
    $('#content-wrap').style.maxWidth = v + '%';
    autosave();
  };
  $('#cfg-code-theme').onchange = function() {
    applyHljsTheme(this.value);
    autosave();
  };
  $('#cfg-smooth-scroll').onchange = function() {
    dom.scrollContainer.classList.toggle('no-smooth', !this.checked);
    autosave();
  };
  $('#cfg-word-count').onchange = function() {
    $('#doc-meta').style.display = this.checked ? '' : 'none';
    autosave();
  };
  $('#cfg-live-reload').onchange = function() { autosave(); };

  $$('.theme-btn').forEach(btn => btn.onclick = () => {
    $$('.theme-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    dom.body.dataset.theme = btn.dataset.theme;
    autosave();
  });
  $$('.font-btn').forEach(btn => btn.onclick = () => {
    $$('.font-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    dom.body.dataset.font = btn.dataset.font;
    autosave();
  });
  $$('.palette-btn').forEach(btn => btn.onclick = () => {
    $$('.palette-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const pal = btn.dataset.palette;
    if (pal === 'amber') delete dom.body.dataset.palette;
    else dom.body.dataset.palette = pal;
    autosave();
  });
  $('#cfg-language').onchange = function() {
    setLanguage(this.value);
    autosave();
  };

  // View mode buttons
  $$('.view-mode-btn').forEach(btn => btn.onclick = () => setViewMode(btn.dataset.mode));

  // Editor toolbar buttons
  $$('.toolbar-btn').forEach(btn => btn.onclick = () => applyFormat(btn.dataset.action));

  // Link clicks in rendered markdown
  dom.mdContent.addEventListener('click', e => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href) return;
    e.preventDefault();
    // Internal anchor (#section) → scroll the container to the target element
    if (href.startsWith('#')) {
      const target = document.querySelector(href);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    window.mandy.handleLink(href, currentFile);
  });

  // Scroll events
  dom.scrollContainer.addEventListener('scroll', () => {
    syncPreviewToEditor();
    updateProgress();
    updateScrollThumb();
  }, { passive: true });

  // Recalculate thumb on container resize (window resize, sidebar toggle, etc.)
  new ResizeObserver(() => updateScrollThumb()).observe(dom.scrollContainer);

  // Drag-to-scroll on the scroll indicator (flex item, full height)
  $('#scroll-indicator').addEventListener('mousedown', e => {
    e.preventDefault();
    const sc          = dom.scrollContainer;
    const scrollRange = sc.scrollHeight - sc.clientHeight;
    const thumbH      = dom.scrollThumb.offsetHeight;
    const indicatorH  = e.currentTarget.getBoundingClientRect().height;
    const thumbRange  = indicatorH - thumbH;

    // Disable smooth scroll for instant drag feedback
    sc.classList.add('no-smooth');

    // Jump to clicked position centred on the thumb
    const relY = e.clientY - e.currentTarget.getBoundingClientRect().top;
    sc.scrollTop = Math.min(scrollRange, Math.max(0, ((relY - thumbH / 2) / thumbRange) * scrollRange));

    const startY   = e.clientY;
    const startTop = sc.scrollTop;
    function onMove(ev) {
      const delta = ev.clientY - startY;
      sc.scrollTop = Math.min(scrollRange, Math.max(0, startTop + (delta / thumbRange) * scrollRange));
    }
    function onUp() {
      sc.classList.remove('no-smooth');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  // IPC from main process
  window.mandy.onFileOpened(data => openDocument(data));
  window.mandy.onFileChanged(({ content, html }) => {
    if (!liveReload) return;
    currentContent = content;
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (activeTab) { activeTab.content = content; activeTab.html = html || ''; }
    dom.mdContent.innerHTML = html || '';
    addHeadingIds();
    buildTOC();
    const words = countWords(content);
    dom.docStats.words.textContent = `${words.toLocaleString()} ${t('words')}`;
    dom.docStats.read.textContent  = `~${Math.max(1, Math.round(words / 200))} ${t('minRead')}`;
    dom.docStats.chars.textContent = `${content.length.toLocaleString()} ${t('chars')}`;
  });
  window.mandy.onOpenFolder(folderPath => openFolder(folderPath));
  window.mandy.onAction(action => {
    switch (action) {
      case 'open-settings': openSettings(); break;
      case 'find': openFind(); break;
      case 'toggle-toc': switchTab('toc'); toggleSidebar(true); break;
      case 'toggle-focus': toggleFocus(); break;
      case 'zoom-in': applyZoom((cfg.zoom || 1) + 0.1); break;
      case 'zoom-out': applyZoom((cfg.zoom || 1) - 0.1); break;
      case 'zoom-reset': applyZoom(1); break;
      case 'print': window.mandy.print(); break;
      case 'save': saveFile(); break;
      case 'new-file': newFile(); break;
      case 'new-tab':   newWelcomeTab(); break;
      case 'close-tab': closeTab(activeTabId); break;
      case 'mode-preview': setViewMode('preview'); break;
      case 'mode-split': setViewMode('split'); break;
      case 'mode-edit': setViewMode('edit'); break;
    }
  });

  // Show sidebar unless hidden
  if (cfg.showTOC === false) dom.sidebar.classList.add('hidden');

  // Start with no tabs — just show the welcome screen
  dom.viewer.classList.add('hidden');
  dom.welcome.classList.remove('hidden');
  renderTabBar();

  // Pull any file that was passed at launch (e.g. double-clicking a .md file).
  // We do this here, after onFileOpened is registered, to avoid the timing race
  // where ready-to-show fires before the listener is set up.
  const pendingFile = await window.mandy.getPendingFile();
  if (pendingFile) window.mandy.openFileFromPath(pendingFile);
}

init().catch(console.error);
