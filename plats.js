/* ═══════════════════════════════════════════════════════════════
   plats.js — Onglet « Nourriture » (menu Plus) : ce qu'il faut goûter en Chine.

   - Une liste rangée par catégorie : nouilles et raviolis, piment et fondue, plats, snacks de rue,
     chaînes et fast-food 100 % chinois, boissons, desserts.
   - Chaque fiche : le nom en caractères chinois, le pinyin, ce que c'est, où le trouver, le niveau de piment
     et la phrase à montrer au serveur. Toucher une carte l'ouvre en plein écran.
   - On coche « goûté » : la coche reste sur l'appareil (localStorage), donc elle marche sans réseau.
     Chaque téléphone a donc sa propre liste cochée.
   Aucune table Supabase, aucun prix. Visible par tout le monde (il n'y a rien de privé là-dedans).
   Chargé APRÈS resa.js (réutilise ses styles de puces et de bouton).
   ═══════════════════════════════════════════════════════════════ */

const PL_CATS = [
  { k: 'nouilles', nom: 'Nouilles, raviolis & brioches', court: 'Nouilles', ic: 'bowl', mesure: ['一碗', 'yì wǎn', 'un bol de'] },
  { k: 'feu', nom: 'Piment & fondue', court: 'Piment', ic: 'fire', mesure: ['一份', 'yí fèn', 'une portion de'] },
  { k: 'plats', nom: 'Plats classiques', court: 'Plats', ic: 'utensils', mesure: ['一份', 'yí fèn', 'une portion de'] },
  { k: 'snack', nom: 'Snacks de rue', court: 'Snacks', ic: 'skewer', mesure: ['一份', 'yí fèn', 'une portion de'] },
  { k: 'chaine', nom: 'Chaînes & fast-food made in China', court: 'Chaînes', ic: 'burger', mesure: ['一个', 'yí gè', 'un'] },
  { k: 'boisson', nom: 'Boissons', court: 'Boissons', ic: 'boba', mesure: ['一杯', 'yì bēi', 'un verre de'] },
  { k: 'dessert', nom: 'Desserts & sucreries', court: 'Desserts', ic: 'icecream', mesure: ['一份', 'yí fèn', 'une portion de'] },
];
const PL_VILLES = { sh: 'Shanghai', cq: 'Chongqing', cd: 'Chengdu', hn: 'Zhangjiajie · Furong', '*': 'Partout' };
const PL_VILLES_CHIPS = [['sh', 'Shanghai'], ['cq', 'Chongqing'], ['cd', 'Chengdu'], ['hn', 'Zhangjiajie']];
const PL_PIMENT = ['Pas piquant', 'Un peu piquant', 'Piquant', 'Très piquant'];

/* Chaque ligne : [id, catégorie, villes, piment 0-3, incontournable 0/1, nom français, caractères, pinyin,
                   description, à savoir (facultatif), mesure [caractères, pinyin, français] (facultatif), lieu libre (facultatif)] */
const PL_BRUT = [
  /* ───────── Nouilles, raviolis & brioches ───────── */
  ['xlb', 'nouilles', 'sh', 0, 1, 'Xiaolongbao, brioche vapeur à la soupe', '小笼包', 'xiǎolóngbāo',
    "Petite brioche vapeur à la pâte très fine, fourrée de porc et d'un bouillon gélifié qui fond à la cuisson. On la soulève avec les baguettes, on perce la peau avec les dents, on boit le bouillon, puis on mange le reste. Shanghai en a fait son emblème.",
    "Trempe-la dans du vinaigre noir avec des lanières de gingembre. Le bouillon est brûlant : mords un petit coin d'abord. La version de Nanxiang (南翔) passe pour l'originale.", ['一笼', 'yì lóng', 'un panier de']],
  ['sjb', 'nouilles', 'sh', 0, 1, 'Shengjianbao, brioche poêlée', '生煎包', 'shēngjiānbāo',
    "Petite brioche de pâte levée, farcie de porc et de bouillon, dorée et croustillante en dessous grâce à la poêle, parsemée de sésame et de ciboule. C'est le petit déjeuner de rue des Shanghaïens.",
    "Aspire d'abord un peu de jus par un petit trou, sinon il gicle.", ['一份', 'yí fèn', 'une portion de']],
  ['cybm', 'nouilles', 'sh', 0, 0, "Nouilles à l'huile de ciboule", '葱油拌面', 'cōngyóu bànmiàn',
    "Nouilles fines mélangées à une huile de ciboule frite très parfumée et à un filet de sauce soja. Presque rien dedans, et pourtant c'est l'un des plats que les Shanghaïens réclament le plus.", ''],
  ['chun', 'nouilles', 'sh', 0, 0, 'Wontons aux légumes et au porc', '菜肉馄饨', 'càiròu húntun',
    "Les wontons de Shanghai : une farce de porc et de petit chou vert dans une pâte très fine, servis dans un bouillon clair avec des algues et de la ciboule. Un repas léger et chaud quand il fait frais.", ''],
  ['dandan', 'nouilles', 'cd,cq', 2, 1, 'Dandan mian, nouilles au sésame et piment', '担担面', 'dàndan miàn',
    "Nouilles dans une sauce rouge de piment, de pâte de sésame et de poivre du Sichuan, avec du porc haché et un peu de légume mariné. Le nom vient des marchands ambulants qui portaient leur marmite au bout d'un bâton (dandan).",
    "Mélange tout avant de manger : le meilleur est au fond du bol. Souvent presque sans bouillon."],
  ['xiaomian', 'nouilles', 'cq', 3, 1, 'Xiaomian de Chongqing', '重庆小面', 'Chóngqìng xiǎomiàn',
    "Le petit déjeuner de Chongqing : nouilles de blé dans une sauce de piment, poivre du Sichuan, ail et vinaigre, avec des pousses vertes. La ville compte des milliers de petites échoppes, et chacune a sa recette.",
    "Si tu hésites, dis 微辣 (wēi là), « un tout petit peu piquant »."],
  ['wanza', 'nouilles', 'cq', 2, 0, 'Nouilles aux pois et au porc haché', '豌杂面', 'wān zá miàn',
    "Nouilles garnies de pois cassés mijotés (wan) et d'un hachis de porc (za). Plus doux et plus réconfortant que le xiaomian, un classique des petites cantines de quartier de Chongqing.", ''],
  ['sulafen', 'nouilles', 'cq,cd', 3, 1, 'Suan la fen, nouilles aigres-piquantes', '酸辣粉', 'suānlà fěn',
    "Nouilles translucides de patate douce dans un bouillon aigre et très pimenté, avec cacahuètes, pousses de soja et vinaigre. C'est le snack préféré de Chongqing, mangé à toute heure.", ''],
  ['feichang', 'nouilles', 'cq,cd', 2, 0, 'Nouilles aux boyaux de porc', '肥肠粉', 'féicháng fěn',
    "Vermicelles de patate douce dans un bouillon rouge, avec des morceaux de gros intestin de porc très bien nettoyés. Un plat d'abats pour les curieux, très aimé dans le Sichuan.",
    "Si tu veux essayer l'abat sans te lancer dans un bol entier, demande-en un petit."],
  ['lanzhou', 'nouilles', '*', 1, 0, 'Nouilles étirées de Lanzhou', '兰州拉面', 'Lánzhōu lāmiàn',
    "Nouilles étirées à la main sous tes yeux, dans un bouillon clair de bœuf, avec du radis blanc, de la coriandre et un peu d'huile pimentée. Ces restaurants, souvent tenus par des familles musulmanes Hui, sont partout et peu chers.", ''],
  ['changde', 'nouilles', 'hn', 2, 0, 'Nouilles de riz de Changde', '常德米粉', 'Chángdé mǐfěn',
    "Le petit déjeuner du Hunan : nouilles de riz rondes dans un bouillon relevé, avec du bœuf braisé ou du porc. Chacun ajoute lui-même piment, ciboule et coriandre à son goût.", ''],
  ['luosi', 'nouilles', '*', 2, 1, "Luosifen, nouilles à l'escargot de rivière", '螺蛳粉', 'luósīfěn',
    "Nouilles de riz dans un bouillon d'escargots de rivière, avec pousses de bambou fermentées, cacahuètes et piment. L'odeur du bambou fermenté est célèbre et très forte : on adore ou on fuit. Le goût, lui, est riche et épicé.",
    "Si l'odeur te freine, demande-le à emporter et mange-le dehors."],
  ['jiaozi', 'nouilles', '*', 0, 1, 'Jiaozi, raviolis', '饺子', 'jiǎozi',
    "Raviolis en croissant, bouillis, poêlés (guōtiē) ou à la vapeur, fourrés de porc et chou, d'agneau, de crevettes ou d'œuf et ciboulette. On les trempe dans du vinaigre noir avec de l'huile pimentée.",
    "Le Nord les mange bouillis, le Sud plus souvent poêlés.", ['一份', 'yí fèn', 'une portion de']],
  ['zhongshui', 'nouilles', 'cd', 2, 1, 'Raviolis de Zhong à l\'huile rouge', '钟水饺', 'Zhōng shuǐjiǎo',
    "Les raviolis de Chengdu : petits, farcis de porc, nappés d'une sauce rouge douce-piquante à base de soja, d'ail, de sucre et d'huile de piment. Une maison de la ville, vieille de plus d'un siècle, leur a donné son nom.", ''],
  ['chaoshou', 'nouilles', 'cd', 1, 0, 'Chaoshou, wontons du Sichuan', '龙抄手', 'lóng chāoshǒu',
    "Les wontons de Chengdu (« chaoshou » dans le dialecte local), en soupe claire ou nappés d'huile pimentée. Pâte très fine, farce de porc délicate.", ''],
  ['baozi', 'nouilles', '*', 0, 0, 'Baozi, brioches vapeur farcies', '包子', 'bāozi',
    "Brioches vapeur grosses comme un poing, farcies de porc, de chou, de haricot rouge sucré ou de pâte de sésame. On les achète à la pièce dans les petites échoppes ouvertes dès l'aube.", '', ['两个', 'liǎng gè', 'deux']],

  /* ───────── Piment & fondue ───────── */
  ['huoguo', 'feu', 'cq', 3, 1, 'Fondue pimentée de Chongqing', '重庆火锅', 'Chóngqìng huǒguō',
    "Un bouillon rouge à la graisse de bœuf, au piment et au poivre du Sichuan bout au milieu de la table : tu y plonges tripes, viandes, légumes et tofu, puis tu trempes dans de l'huile de sésame à l'ail. C'est LE plat de Chongqing.",
    "Demande 鸳鸯锅 (yuānyāng guō), une marmite moitié piquante, moitié claire. À tester : 毛肚 (tripes de bœuf) et 鸭肠 (intestin de canard), à tremper quelques secondes seulement.", ['一个', 'yí gè', 'un']],
  ['maoxuewang', 'feu', 'cq', 3, 0, 'Maoxuewang, sang de canard au piment', '毛血旺', 'máo xuè wàng',
    "Sang de canard coagulé, tripes, tranches de porc et germes de soja, dans un bouillon rouge couvert d'huile pimentée. Un grand classique de Chongqing, moins effrayant qu'il n'en a l'air : le sang a la texture d'un tofu ferme.", ''],
  ['chuanchuan', 'feu', 'cd,cq', 3, 1, 'Chuanchuan, fondue en brochettes', '串串香', 'chuànchuan xiāng',
    "Une fondue à la carte : tu prends des brochettes de viande, de légumes et de tofu dans un réfrigérateur, tu les cuis dans le bouillon pimenté, et on compte les bâtons à la fin pour l'addition. Plus simple, plus rapide et moins chère que la fondue classique.", ''],
  ['maocai', 'feu', 'cd', 2, 0, 'Maocai, bol de fondue à emporter', '冒菜', 'màocài',
    "Une fondue en solitaire : tu choisis tes ingrédients, ils sont cuits ensemble dans le bouillon pimenté puis servis dans un bol avec un peu de jus. Parfait pour un déjeuner rapide à Chengdu. Le cousin plus connu s'appelle 麻辣烫 (málàtàng).", ''],
  ['laziji', 'feu', 'cq', 3, 1, 'Laziji, poulet caché sous les piments', '辣子鸡', 'làzi jī',
    "Petits morceaux de poulet frits, enfouis sous une montagne de piments secs et de poivre du Sichuan. On cherche le poulet avec les baguettes : les piments ne se mangent pas, ils servent à parfumer. Né à Geleshan, près de Chongqing.",
    "Ne grignote pas les piments entiers : mange seulement le poulet."],
  ['kaoyu', 'feu', 'cq', 2, 1, 'Kaoyu, poisson grillé en marmite', '烤鱼', 'kǎo yú',
    "Un poisson entier grillé puis servi sur un plat chauffant, dans une sauce épicée avec des légumes que tu choisis à la carte. À partager à deux ou trois. La ville de Wanzhou, au nord-est de Chongqing, en a fait une spécialité.",
    "Choisis la sauce (piquante, claire, aux herbes) et ajoute tes légumes : pommes de terre, lotus, champignons.", ['一份', 'yí fèn', 'un']],
  ['suancaiyu', 'feu', 'cq,cd', 1, 0, 'Poisson au chou fermenté', '酸菜鱼', 'suāncài yú',
    "Filets de poisson blanc dans un bouillon acidulé de chou fermenté, avec un peu de piment. Plus aigre que piquant, un bouillon très frais qui change du rouge intense.", ''],
  ['shuizhu', 'feu', 'cd,cq', 3, 0, 'Bœuf poché à l\'huile pimentée', '水煮牛肉', 'shuǐzhǔ niúròu',
    "Tranches de bœuf pochées dans un bouillon d'huile pimentée, recouvertes de piments secs et de poivre. Le nom veut dire « bœuf cuit à l'eau », mais l'eau ne se voit pas : c'est de l'huile rouge brûlante.", ''],
  ['fuqi', 'feu', 'cd', 2, 0, 'Fuqi feipian, bœuf froid pimenté', '夫妻肺片', 'fūqī fèipiàn',
    "Tranches froides de bœuf, de langue et de tripes dans une sauce piment, sésame et cacahuètes. Le nom signifie « lamelles de poumon des époux », car le couple qui l'a lancé en vendait au coin de la rue : aujourd'hui, il n'y a plus de poumon.", ''],
  ['koushui', 'feu', 'cd', 2, 0, 'Poulet à la salive', '口水鸡', 'kǒushuǐ jī',
    "Poulet froid poché, nappé d'une sauce piment, sésame et ail qui fait saliver rien qu'à la regarder : d'où son nom. Une entrée froide piquante et fraîche à la fois.", ''],
  ['gangguo', 'feu', 'cq,hn', 3, 0, 'Gan guo, marmite sèche', '干锅', 'gānguō',
    "La version sans bouillon de la fondue : poulet, lapin, chou-fleur ou fruits de mer sautés avec des piments dans un petit wok qui reste chaud sur un brûleur à ta table. Très parfumé.", ''],
  ['tutou', 'feu', 'cd', 2, 0, 'Tête de lapin braisée', '麻辣兔头', 'málà tùtóu',
    "Une tête de lapin braisée aux épices, le snack insolite de Chengdu. On grignote les joues et la langue, la chair y est tendre. À tenter pour le défi, les locaux en raffolent avec une bière.", ''],

  /* ───────── Plats classiques ───────── */
  ['mapo', 'plats', 'cd', 2, 1, 'Mapo tofu', '麻婆豆腐', 'mápó dòufu',
    "Tofu très tendre et porc ou bœuf haché dans une sauce rouge à la pâte de fèves piquante et au poivre du Sichuan, qui engourdit les lèvres. Le plat emblématique du Sichuan, qui doit son nom à la « vieille au visage marqué » (mapo) qui l'aurait inventé.",
    "Le « má » (麻) est un picotement, pas de la brûlure. Mange-le avec beaucoup de riz blanc."],
  ['huiguo', 'plats', 'cd,cq', 1, 1, 'Porc cuit deux fois', '回锅肉', 'huíguō ròu',
    "Poitrine de porc d'abord bouillie, puis tranchée finement et sautée avec des poireaux et de la pâte de fèves. « Cuite deux fois », comme son nom l'indique. C'est le plat que les familles du Sichuan préparent le plus souvent.", ''],
  ['gongbao', 'plats', 'cd,cq', 1, 0, 'Poulet Kung Pao', '宫保鸡丁', 'gōngbǎo jīdīng',
    "Dés de poulet sautés avec cacahuètes, piments secs et sauce aigre-douce. La version du Sichuan n'a rien à voir avec celle qu'on mange à l'étranger : plus de poivre qui picote, moins de sucre.", ''],
  ['yuxiang', 'plats', 'cd,cq', 1, 0, 'Porc sauce « parfum de poisson »', '鱼香肉丝', 'yúxiāng ròusī',
    "Fines lanières de porc, champignons noirs et bambou dans une sauce d'ail, gingembre, vinaigre, piment et sucre. Aucun poisson dedans : c'est l'assaisonnement qu'on utilisait autrefois pour cuisiner le poisson.", ''],
  ['ganbian', 'plats', 'cd,cq', 1, 0, 'Haricots verts sautés à sec', '干煸四季豆', 'gānbiān sìjìdòu',
    "Haricots verts sautés à sec jusqu'à ce qu'ils ridulent, avec du porc haché, des piments et des légumes marinés. Un légume du Sichuan que même les sceptiques adorent.", ''],
  ['tudousi', 'plats', '*', 1, 0, 'Pommes de terre râpées aigres-piquantes', '酸辣土豆丝', 'suānlà tǔdòusī',
    "De fines lanières de pomme de terre sautées vivement, restées croquantes, avec vinaigre et piment. Un plat tout simple, végétarien, que presque tous les restaurants servent.", ''],
  ['xihongshi', 'plats', '*', 0, 0, 'Œufs brouillés aux tomates', '西红柿炒鸡蛋', 'xīhóngshì chǎo jīdàn',
    "Œufs brouillés et tomates sautées, légèrement sucrés. C'est le plat « de maman » que chaque Chinois a mangé mille fois, doux et réconfortant, parfait après plusieurs jours très pimentés.", ''],
  ['danchao', 'plats', '*', 0, 0, "Riz sauté à l'œuf", '蛋炒饭', 'dàn chǎofàn',
    "Riz sauté au wok avec des œufs et de la ciboule, rien de plus. En Chine, c'est le test d'un cuisinier : chaque grain doit rester séparé, brillant et parfumé. À commander à côté de plats pimentés.", ''],
  ['hongshao', 'plats', 'sh,hn', 0, 1, 'Porc braisé rouge', '红烧肉', 'hóngshāo ròu',
    "Poitrine de porc mijotée longuement dans du soja, du sucre candi et du vin de Shaoxing, jusqu'à devenir laquée et fondante. À Shanghai elle est sucrée-salée ; au Hunan, la version de Mao Zedong (毛氏红烧肉) est plus relevée et sans sucre.", ''],
  ['tangcu', 'plats', '*', 0, 0, 'Porc aigre-doux', '糖醋里脊', 'tángcù lǐjǐ',
    "Des bâtonnets de filet de porc frits, enrobés d'une sauce rouge-orangé acidulée et sucrée. Bien loin de la version européenne : la panure est fine, croustillante, et la sauce est vinaigrée.", ''],
  ['kaoya', 'plats', 'sh', 0, 0, 'Canard laqué de Pékin', '北京烤鸭', 'Běijīng kǎoyā',
    "Canard rôti à la peau très croustillante, découpé devant toi et enroulé dans de fines crêpes avec ciboule, concombre et sauce de fèves sucrée. Pékin n'est pas au programme, mais Shanghai a de très bonnes adresses.",
    "Mange d'abord un morceau de peau trempé dans un peu de sucre : c'est le geste traditionnel.", ['一只', 'yì zhī', 'un']],
  ['dazhaxie', 'plats', 'sh', 0, 1, 'Crabe poilu de Shanghai', '大闸蟹', 'dàzháxiè',
    "Le crabe d'eau douce d'automne, surtout celui du lac Yangcheng, cuit à la vapeur avec du gingembre, mangé avec du vinaigre noir et du vin jaune chaud. Novembre est la pleine saison : dicton « 九雌十雄 », les femelles en octobre, les mâles en novembre, à la chair la plus fine.",
    "Demande le prix avant de commander : il se vend au poids, et peut vite grimper.", ['一只', 'yì zhī', 'un']],
  ['douhua', 'plats', 'cq,cd', 1, 0, 'Douhua fan, tofu soyeux au riz', '豆花饭', 'dòuhuā fàn',
    "Un tofu très doux (douhua) servi chaud avec du riz et des trempettes de piment, de légumes marinés et de bouillon. Une cantine traditionnelle du Sichuan et de Chongqing, qu'on mange à midi.", ''],
  ['xiaochaorou', 'plats', 'hn', 3, 1, 'Porc sauté aux piments verts', '农家小炒肉', 'nóngjiā xiǎochǎo ròu',
    "Le plat le plus emblématique du Hunan : fines tranches de porc sautées vivement avec des piments verts frais, de l'ail et du soja. Brûlant, direct, sans sucre. Tout le monde en mange à Zhangjiajie.", ''],
  ['huangniu', 'plats', 'hn', 3, 0, 'Bœuf jaune sauté au piment', '小炒黄牛肉', 'xiǎochǎo huángniúròu',
    "Du bœuf sauté très vite au wok avec piment frais, ail, gingembre et coriandre. Un classique du Hunan, très tendre quand il est réussi.", ''],
  ['duojiao', 'plats', 'hn', 3, 1, 'Tête de poisson aux piments hachés', '剁椒鱼头', 'duòjiāo yútóu',
    "Une tête de carpe cuite à la vapeur sous un manteau de piment haché salé et fermenté. La chair des joues est gélatineuse et délicate ; la sauce est faite pour y tremper des nouilles ou du riz.",
    "Commande des nouilles ou du riz pour finir la sauce : c'est la meilleure partie.", ['一份', 'yí fèn', 'un']],
  ['larou', 'plats', 'hn', 1, 1, 'Porc fumé des Tujia', '土家腊肉', 'Tǔjiā làròu',
    "Du porc salé, fumé et séché au-dessus du feu de bois par les Tujia, la minorité de la région. Sauté avec piments et ail, c'est très parfumé et très salé. Le produit-phare de Zhangjiajie.",
    "Très salé : à manger avec beaucoup de riz."],
  ['sanxia', 'plats', 'hn', 2, 1, 'Sanxiaguo, marmite des Tujia', '三下锅', 'sānxiàguō',
    "La marmite des Tujia : porc, abats, tofu et légumes mijotés ensemble dans un petit chaudron qui reste chaud à table. Une spécialité de la région de Zhangjiajie, chaque famille a sa version.", ''],
  ['midoufu', 'plats', 'hn', 2, 1, 'Mi doufu, « tofu » de riz de Furong', '米豆腐', 'mǐ dòufu',
    "Des cubes de pâte de riz fermentée, tendres, mijotés ou sautés dans une sauce épicée. C'est la spécialité du village de Furong, rendue célèbre par le film « Hibiscus Town » (芙蓉镇) de 1986.", ''],
  ['wanwan', 'plats', 'cq', 1, 0, 'Agneau en petits bols de Wulong', '武隆碗碗羊肉', 'Wǔlóng wǎnwǎn yángròu',
    "Un ragoût d'agneau servi dans des bols, spécialité de Wulong (武隆). Une viande tendre, qui change des plats très pimentés de Chongqing. La recette varie selon les restaurants.", '',
    ['一份', 'yí fèn', 'une portion de'], 'Wulong'],

  /* ───────── Snacks de rue ───────── */
  ['jianbing', 'snack', '*', 1, 1, 'Jianbing, crêpe salée de rue', '煎饼果子', 'jiānbǐng guǒzi',
    "Une crêpe de blé et de mil étalée à la minute sur une plaque, avec un œuf, de la sauce, de la ciboule et un croustillant de pâte frite roulé dedans. Le petit déjeuner de rue n°1.",
    "Pour moins de piment, dis 不要辣 (bú yào là)."],
  ['roujiamo', 'snack', '*', 0, 1, 'Roujiamo, le « hamburger chinois »', '肉夹馍', 'ròujiāmó',
    "Un petit pain plat grillé, coupé en deux et garni de porc braisé haché, parfois avec des piments verts. Né à Xi'an, on en trouve partout.", ''],
  ['yangrouchuan', 'snack', '*', 1, 1, "Brochettes d'agneau au cumin", '羊肉串', 'yángròu chuàn',
    "Brochettes d'agneau grillées au charbon, saupoudrées de cumin et de piment, comme les Ouïghours du Xinjiang les préparent. Devenues le barbecue de rue de toute la Chine, surtout le soir.", '',
    ['五串', 'wǔ chuàn', 'cinq brochettes de']],
  ['tanghulu', 'snack', '*', 0, 1, 'Tanghulu, fruits caramélisés sur pique', '糖葫芦', 'tánghúlu',
    "Des fruits enrobés d'une fine coque de sucre dur et transparent : traditionnellement des cenelles (aubépines), aujourd'hui aussi des fraises, du raisin et des mandarines. C'est une friandise d'hiver.",
    "Croque vite : il colle et fond dans la main quand il fait doux.", ['一根', 'yì gēn', 'un']],
  ['lizi', 'snack', '*', 0, 0, 'Châtaignes sautées au sucre', '糖炒栗子', 'tángchǎo lìzi',
    "Des châtaignes grillées dans du sable chaud et du sucre, vendues au sachet. Chaudes, sucrées, fondantes : l'odeur des rues en automne et en hiver.", ''],
  ['hongshu', 'snack', '*', 0, 0, 'Patate douce rôtie', '烤红薯', 'kǎo hóngshǔ',
    "Une patate douce cuite dans un baril chauffé, à la chair fondante presque confite. On la pèse devant toi. Parfaite pour se réchauffer les mains en novembre.", ''],
  ['chadan', 'snack', '*', 0, 0, 'Œuf mijoté au thé', '茶叶蛋', 'cháyè dàn',
    "Un œuf dur dont on fêle la coquille, puis mijoté dans du thé, du soja et de l'anis étoilé pour le marbrer. On en trouve au comptoir de presque tous les supermarchés de proximité.", ''],
  ['choudoufu', 'snack', '*', 1, 1, 'Tofu fermenté « puant »', '臭豆腐', 'chòu dòufu',
    "Du tofu fermenté à l'odeur terrible, frit puis servi avec de la sauce piment ou soja. Beaucoup plus doux que son nom : croustillant dehors, mou dedans. Le tofu noir de Changsha est le plus célèbre.",
    "Tu le sentiras bien avant de le voir : suis ton nez."],
  ['guokui', 'snack', 'cd', 0, 0, 'Guokui, pain plat croustillant', '锅盔', 'guōkuī',
    "Un grand pain plat épais, cuit à sec et très croustillant, qu'on mange à la part, nature ou garni de viande. Un en-cas du Sichuan, solide, qui cale bien.", ''],
  ['yeerba', 'snack', 'cd,cq', 0, 0, 'Gâteau de riz en feuille', '叶儿粑', 'yè\'erbā',
    "Un petit gâteau de riz gluant cuit à la vapeur dans une feuille, fourré de porc salé ou de pâte sucrée. L'odeur de la feuille chaude parfume le tout.", ''],
  ['sursou', 'snack', 'cd,cq', 0, 0, 'Petits morceaux de porc frits', '小酥肉', 'xiǎo sūròu',
    "De petites lamelles de porc enrobées de pâte et frites jusqu'à devenir croustillantes, servies en barquette ou dans les soupes. Le grignotage préféré du Sichuan.", ''],
  ['yabo', 'snack', '*', 3, 1, 'Cou de canard braisé épicé', '鸭脖', 'yābó',
    "Du cou de canard braisé aux épices et grignoté os après os : le snack des soirées télé en Chine. Des chaînes comme Zhou Hei Ya (周黑鸭) et Juewei (绝味) en vendent dans toutes les rues.", ''],
  ['fengzhua', 'snack', '*', 1, 0, 'Pattes de poulet braisées', '凤爪', 'fèngzhuǎ',
    "Des pattes de poulet braisées dans une sauce épicée, désossées en bouche. Tout est dans la texture : gélatineuse et fondante. À tenter pour le défi, les Chinois adorent.", ''],
  ['latiao', 'snack', 'hn', 3, 0, 'Latiao, lanières de gluten pimentées', '辣条', 'làtiáo',
    "Des lanières de gluten ou de farine, grasses et très épicées, vendues en sachet. Un snack d'enfance culte né au Hunan, dont la marque Weilong (卫龙) est devenue une star.", ''],
  ['guandong', 'snack', '*', 0, 0, 'Guandongzhu, brochettes en bouillon', '关东煮', 'guāndōngzhǔ',
    "Des brochettes mijotant dans un bouillon doux (boulettes de poisson, radis blanc, tofu, œuf) au comptoir des supermarchés de proximité. Parfait un soir froid de novembre pour moins d'une poignée de yuans.", ''],
  ['liangpi', 'snack', '*', 2, 0, 'Liangpi, nouilles froides', '凉皮', 'liángpí',
    "Des lanières froides de pâte de blé ou de riz, avec concombre, vinaigre, sésame et huile pimentée. Un en-cas frais et acidulé, qui change du chaud.", ''],
  ['youtiao', 'snack', '*', 0, 0, 'Youtiao, beignet salé', '油条', 'yóutiáo',
    "Un long beignet doré et soufflé, salé, qu'on trempe dans du lait de soja chaud (豆浆) ou qu'on roule dans une crêpe. Le petit déjeuner de base partout en Chine.", '',
    ['一根', 'yì gēn', 'un']],
  ['xianrou', 'snack', 'sh', 0, 1, 'Gâteau feuilleté au porc de Shanghai', '鲜肉月饼', 'xiānròu yuèbǐng',
    "Un petit gâteau feuilleté cuit au four, fourré de porc frais et de jus, vendu chaud par les boulangeries de Shanghai, avec une file d'attente devant les plus célèbres. Un « gâteau de lune » salé, toute l'année.", '',
    ['两个', 'liǎng gè', 'deux']],
  ['guazi', 'snack', '*', 0, 0, 'Graines de tournesol', '瓜子', 'guāzǐ',
    "Les Chinois les grignotent partout, entre amis ou dans le train, et les décortiquent d'un coup de dent en quelques secondes. Regarde comment ils font : un vrai sport national.", ''],

  /* ───────── Chaînes & fast-food made in China ───────── */
  ['tastien', 'chaine', '*', 0, 1, 'Tastien, le « burger chinois »', '塔斯汀', 'Tǎsītīng',
    "Une chaîne née en Chine qui remplace le pain à burger par une galette de pâte levée cuite façon pain plat, garnie de poulet frit croustillant ou de bœuf. On y mange un burger « à la chinoise » qu'on ne trouve pas hors du pays.",
    "Le slogan de la chaîne est « 中国汉堡 » (le burger chinois) : repère-le sur les enseignes.", ['一个', 'yí gè', 'un']],
  ['kfcwrap', 'chaine', '*', 0, 1, 'KFC : wrap « vieux Pékin »', '老北京鸡肉卷', 'Lǎo Běijīng jīròu juǎn',
    "Un classique exclusif de KFC Chine : un wrap de poulet frit, concombre, ciboule et sauce de fèves sucrée, inspiré du canard laqué de Pékin. On ne le trouve pas en Europe.", '',
    ['一个', 'yí gè', 'un']],
  ['kfczhou', 'chaine', '*', 0, 0, 'KFC : bouillie de riz à l\'œuf de cent ans', '皮蛋瘦肉粥', 'pídàn shòuròu zhōu',
    "Au petit déjeuner, KFC Chine sert de la bouillie de riz (congee) au porc et à l'œuf de cent ans, avec des youtiao. Un petit déjeuner chinois dans un restaurant américain.", '',
    ['一碗', 'yì wǎn', 'un bol de']],
  ['eggtart', 'chaine', '*', 0, 0, 'Tarte à l\'œuf portugaise', '葡式蛋挞', 'Pútáo shì dàntà',
    "Une petite tarte à la crème brûlée, au feuilletage fin et à la crème vanillée, très populaire en Chine depuis les années 2000. KFC en vend, tout comme les boulangeries.", '',
    ['两个', 'liǎng gè', 'deux']],
  ['mcteri', 'chaine', '*', 0, 1, 'McDonald\'s : burger poulet grillé', '板烧鸡腿堡', 'bǎnshāo jītuǐ bǎo',
    "Un burger de cuisse de poulet grillée avec une sauce sucrée-salée, salade et mayonnaise. Une vedette de McDonald's en Chine, très peu connue en Europe.",
    "La carte change selon la saison et la ville : regarde les bornes et les affiches.", ['一个', 'yí gè', 'un']],
  ['mcwings', 'chaine', '*', 2, 0, 'McDonald\'s : ailes de poulet piquantes', '麦辣鸡翅', 'màilà jīchì',
    "Des ailes de poulet frites, croustillantes et épicées, vendues par deux. Un des best-sellers de McDonald's en Chine, qui n'est pas au menu partout dans le monde.", '',
    ['一份', 'yí fèn', 'une portion de']],
  ['mctaro', 'chaine', '*', 0, 1, 'McDonald\'s : chausson au taro', '香芋派', 'xiāngyù pài',
    "Un chausson frit au taro violet, à la crème sucrée et parfumée. Ce dessert de McDonald's est une star en Asie et n'existe pas en Europe. Il revient selon la saison.",
    "La carte change : s'il n'y a pas de chausson au taro, demande 红豆派 (hóngdòu pài), au haricot rouge.", ['一个', 'yí gè', 'un']],
  ['pizzahut', 'chaine', '*', 0, 0, 'Pizza Hut, version restaurant chic', '必胜客', 'Bìshèngkè',
    "En Chine, Pizza Hut est un vrai restaurant à table, avec des pizzas aux saveurs locales (crevettes, bœuf au poivre, parfois durian), des plats sautés et des desserts. C'est plus chic qu'en France.", '',
    ['一个', 'yí gè', 'une']],
  ['wallace', 'chaine', '*', 0, 0, 'Wallace, fast-food chinois', '华莱士', 'Huáláishì',
    "Une chaîne chinoise de poulet frit, burgers et frites, très bon marché, qui copie le modèle des grands noms américains. Elle compte des milliers de magasins : le fast-food des étudiants.", '',
    ['一个', 'yí gè', 'un']],
  ['haidilao', 'chaine', '*', 2, 1, 'Haidilao, fondue au service hors norme', '海底捞', 'Hǎidǐlāo',
    "Une chaîne de fondue née dans le Sichuan, célèbre pour son service : manucure, jeux et snacks gratuits pendant l'attente, tablier, élastique pour les cheveux, housse pour le téléphone. À certaines tables, un cuisinier étire des nouilles en dansant.",
    "Réserve ou prends un ticket dès l'ouverture : l'attente peut dépasser une heure.", ['一个', 'yí gè', 'un']],
  ['kungfu', 'chaine', '*', 0, 0, 'Zhen Gongfu, fast-food au riz vapeur', '真功夫', 'Zhēn Gōngfu',
    "Un fast-food chinois qui sert du riz vapeur avec du poulet, du bœuf ou du porc au lieu de burgers. Son logo représente un maître de kung-fu. Un repas complet pour presque rien.", '',
    ['一份', 'yí fèn', 'une portion de']],

  /* ───────── Boissons ───────── */
  ['naicha', 'boisson', '*', 0, 1, 'Thé au lait aux perles', '珍珠奶茶', 'zhēnzhū nǎichá',
    "Le bubble tea, né à Taïwan mais devenu une institution en Chine continentale, où l'on en boit toute la journée. Tu choisis le niveau de sucre et de glace.",
    "Dis 少糖 (shǎo táng) pour moins de sucre et 去冰 (qù bīng) sans glaçons."],
  ['heytea', 'boisson', '*', 0, 1, 'HEYTEA : thé au raisin', '多肉葡萄', 'duōròu pútáo',
    "La boisson phare de la chaîne HEYTEA (喜茶) : un thé frais aux gros grains de raisin pressés, avec en option un chapeau de crème au fromage. Un des breuvages qui ont fait la réputation de la chaîne.", ''],
  ['chagee', 'boisson', '*', 0, 0, 'Chagee : thé au lait au jasmin', '伯牙绝弦', 'Bóyá juéxián',
    "La boisson la plus vendue de la chaîne Chagee (霸王茶姬), un thé au lait au jasmin, léger et floral, servi dans un gobelet à l'esthétique traditionnelle.", ''],
  ['mixue', 'boisson', '*', 0, 0, 'Mixue : limonade glacée', '柠檬水', 'níngméng shuǐ',
    "La chaîne Mixue (蜜雪冰城) vend des boissons et des glaces à des prix très bas dans presque toutes les villes. Sa limonade fraîche et son bonhomme de neige « Roi des neiges » (雪王) sont devenus des icônes.", ''],
  ['luckin', 'boisson', '*', 0, 1, 'Luckin : latte à la noix de coco', '生椰拿铁', 'shēngyē nátiě',
    "Le café qui a lancé la chaîne Luckin Coffee (瑞幸) : un latte crémeux au lait de coco, souvent servi glacé. Dans les cafés de Chine, il remplace de plus en plus le café noir.", ''],
  ['moutai', 'boisson', '*', 0, 0, 'Luckin : latte « Moutai »', '酱香拿铁', 'jiàngxiāng nátiě',
    "Un latte né d'une collaboration entre Luckin et Moutai, le baijiu le plus célèbre de Chine. Il contient une petite dose d'alcool de grain : l'arôme est surprenant pour un café. Il est parfois retiré de la carte.",
    "Il peut contenir un peu d'alcool : à éviter avant de conduire ou si tu ne bois pas."],
  ['suanmei', 'boisson', '*', 0, 1, 'Soupe de prunes fumées', '酸梅汤', 'suānméitāng',
    "Une boisson froide ou tiède de prunes fumées, d'aubépine, de réglisse et d'osmanthus, légèrement fumée et acidulée. Réputée digestive, idéale avec un repas gras ou pimenté.", ''],
  ['doujiang', 'boisson', '*', 0, 0, 'Lait de soja chaud', '豆浆', 'dòujiāng',
    "Le lait de soja chaud du petit déjeuner, sucré ou salé selon la région (la version salée contient du vinaigre, de la ciboule et des crevettes séchées). Il se boit avec un beignet youtiao.", ''],
  ['beibingyang', 'boisson', '*', 0, 0, 'Soda orange rétro de Pékin', '北冰洋', 'Běibīngyáng',
    "Un soda orangé à l'ancienne, relancé dans sa bouteille de verre. Plus doux et plus fruité que les sodas habituels, très populaire chez les nostalgiques.", ''],
  ['wanglaoji', 'boisson', '*', 0, 1, 'Boisson aux herbes en canette rouge', '王老吉', 'Wánglǎojí',
    "Une boisson aux herbes (chrysanthème, réglisse) en canette rouge. Les Chinois la boivent pour « refroidir » le corps quand ils mangent pimenté : le compagnon idéal de la fondue.", ''],
  ['bieres', 'boisson', '*', 0, 0, 'Bières locales', '啤酒', 'píjiǔ',
    "Des bières légères et peu alcoolisées : Snow (雪花, Xuěhuā) est la plus vendue du pays, Tsingtao (青岛, Qīngdǎo) la plus connue, et à Chongqing on trouve 山城 (Shānchéng). On les boit froides, parfois avec des glaçons.", '',
    ['一瓶', 'yì píng', 'une bouteille de']],
  ['baijiu', 'boisson', '*', 0, 1, 'Baijiu, alcool de céréales', '白酒', 'báijiǔ',
    "L'alcool fort chinois (40 à 60 degrés), distillé à partir de sorgho et d'autres grains. Le goût est très prononcé et surprend. Les grandes marques sont Moutai (茅台), Wuliangye (五粮液, de Yibin dans le Sichuan) et Luzhou Laojiao (泸州老窖).",
    "On trinque en disant « 干杯 » (gānbēi), cul sec. Goûte-le une fois, au petit verre.", ['一杯', 'yì bēi', 'un verre de']],
  ['huangjiu', 'boisson', 'sh', 0, 0, 'Vin jaune de Shaoxing', '黄酒', 'huángjiǔ',
    "Un vin de riz fermenté, ambré, doux et un peu fumé, souvent servi chaud avec un morceau de gingembre ou de prune confite. Parfait avec le crabe de Shanghai.", '',
    ['一壶', 'yì hú', 'une carafe de']],
  ['gaiwan', 'boisson', 'cd', 0, 1, 'Thé en bol à couvercle', '盖碗茶', 'gàiwǎn chá',
    "Le thé de Chengdu : du thé au jasmin dans un bol couvert posé sur une soucoupe, servi dans les maisons de thé, comme celle de Heming (鹤鸣茶社) dans le parc du Peuple. On y passe l'après-midi, et un serveur à la bouilloire au long bec revient remplir le bol d'eau chaude.",
    "Soulève le couvercle pour écarter les feuilles et boire à petites gorgées.", ['一杯', 'yì bēi', 'un']],
  ['youcha', 'boisson', 'hn', 0, 1, 'Soupe de thé des Tujia', '油茶汤', 'yóuchátāng',
    "Une boisson-soupe des Tujia : du thé frit à l'huile avec des cacahuètes, du riz soufflé et de la ciboule. Salé, chaud et surprenant, c'est un petit déjeuner de montagne.",
    "Ça ne ressemble à aucun thé que tu connais : goûte-le comme une soupe.", ['一碗', 'yì wǎn', 'un bol de']],
  ['yezhi', 'boisson', '*', 0, 0, 'Lait de coco de Hainan', '椰树椰汁', 'Yēshù yēzhī',
    "Du lait de coco en brique, de la marque Yeshu (椰树) de l'île de Hainan, connue pour ses publicités d'un style très particulier. Crémeux et peu sucré, frais en été.", ''],
  ['lulu', 'boisson', '*', 0, 0, 'Lait d\'amande en canette', '露露杏仁露', 'Lùlù xìngrénlù',
    "Un lait d'amande sucré en canette, de la marque Lulu. Une boisson très associée au Nouvel An chinois, qu'on offre souvent en boîte.", ''],
  ['reshui', 'boisson', '*', 0, 1, 'Eau chaude, la boisson nationale', '热水', 'rèshuǐ',
    "Les Chinois boivent l'eau chaude toute l'année, à table comme dans le train, et les fontaines d'eau chaude sont partout. L'eau glacée est rare dans les restaurants.",
    "Pour de l'eau à température ambiante, demande 常温水 (chángwēn shuǐ). Pour de l'eau froide, 冰水 (bīngshuǐ).", ['一杯', 'yì bēi', 'un verre de']],

  /* ───────── Desserts & sucreries ───────── */
  ['bingfen', 'dessert', 'cd,cq', 0, 1, 'Bingfen, gelée glacée au sirop', '冰粉', 'bīngfěn',
    "Une gelée translucide faite de graines, servie froide avec du sirop de sucre roux, des raisins secs, des cacahuètes et des fruits. Le dessert idéal pour éteindre un feu de piment.", ''],
  ['tangyou', 'dessert', 'cd,cq', 0, 0, 'Tangyou guozi, boules frites au sucre', '糖油果子', 'tángyóu guǒzi',
    "De petites boules de riz gluant frites, enrobées d'un caramel dur et enfilées sur un pique. Croquantes dehors, moelleuses dedans. Un snack sucré de rue de Chengdu et de Chongqing.", ''],
  ['sandapao', 'dessert', 'cd', 0, 1, 'Sandapao, trois boules « canon »', '三大炮', 'sāndàpào',
    "Trois boules de riz gluant projetées sur une planche (le bruit rappelle trois coups de canon), puis roulées dans de la poudre de soja grillé et nappées de sirop de sucre roux. Le spectacle fait partie du plaisir.", ''],
  ['laitang', 'dessert', 'cd', 0, 1, 'Lai tangyuan, boules de riz au sésame', '赖汤圆', 'Lài tāngyuán',
    "Des boules de riz gluant fourrées de sésame noir et de sucre, servies dans une eau sucrée chaude. La maison Lai de Chengdu en a fait une institution, avec plus d'un siècle d'histoire.", ''],
  ['danhonggao', 'dessert', 'cd', 0, 0, 'Danhonggao, petit gâteau-crêpe', '蛋烘糕', 'dànhōnggāo',
    "Un petit gâteau-crêpe moelleux, cuit sur une poêle bombée et plié autour d'une garniture : crème, fruits, chocolat, jambon ou œuf. Un snack de Chengdu surtout aimé des étudiants.", ''],
  ['yangzhi', 'dessert', '*', 0, 1, 'Mangue, pomelo et sagou', '杨枝甘露', 'yángzhī gānlù',
    "Un dessert frais né dans le sud, à base de mangue, de pamplemousse, de perles de sagou et de lait de coco. Frais, crémeux, acidulé : on le trouve dans les salons de thé.", ''],
  ['shuangpi', 'dessert', '*', 0, 0, 'Flan au lait à deux peaux', '双皮奶', 'shuāngpínǎi',
    "Un flan au lait de buffle ou de vache, avec deux couches de peau veloutée, servi froid ou tiède avec des haricots rouges. Doux, léger, très fondant.", ''],
  ['tanghua', 'dessert', 'cd', 0, 1, 'Sucre soufflé en dessin', '糖画', 'tánghuà',
    "Un artisan verse du sucre caramélisé en filet sur une plaque pour dessiner un dragon, un lapin ou un phénix, qu'on mange ensuite. Dans les rues de Chengdu, on tourne une roue pour gagner un animal, et le sucre se croque comme un bonbon dur.",
    "Prends-le en photo avant de croquer."],
  ['dabaitu', 'dessert', 'sh', 0, 1, 'Bonbons au lait « Grand Lapin Blanc »', '大白兔奶糖', 'Dàbáitù nǎitáng',
    "Des bonbons mous au lait, nés à Shanghai en 1959, enveloppés dans un papier de riz comestible qu'on peut manger avec le bonbon. Un souvenir à rapporter, pour toutes les générations de Chinois.", ''],
  ['shanzha', 'dessert', '*', 0, 0, "Rondelles d'aubépine", '山楂片', 'shānzhāpiàn',
    "De fines rondelles d'aubépine séchées, acidulées et sucrées, vendues en rouleaux ou en sachets. Un classique des goûters chinois.", ''],
  ['icecream', 'dessert', '*', 0, 0, 'Cornet vanille de Mixue', '蜜雪冰城冰淇淋', 'Mìxuě Bīngchéng bīngqílín',
    "Un cornet de glace vanille à prix mini, vendu par la chaîne Mixue. C'est le dessert le plus accessible de Chine, et un incontournable pour les photos avec le Roi des neiges.", '',
    ['一个', 'yí gè', 'un']],
  ['ciba', 'dessert', 'hn,cq', 0, 1, 'Ciba, gâteau de riz pilé', '糍粑', 'cíbā',
    "Un gâteau de riz gluant pilé, grillé, puis roulé dans de la poudre de soja grillé et du sucre roux. Chez les Tujia de la région de Zhangjiajie et à Chongqing, c'est une douceur de fête, parfois servie dans un sirop.", ''],
  ['jiuniang', 'dessert', 'sh', 0, 0, 'Boulettes de riz au vin de riz', '酒酿圆子', 'jiǔniàng yuánzi',
    "Une soupe sucrée chaude de riz fermenté (légèrement alcoolisé) avec de petites boulettes de riz gluant. Parfaite pour se réchauffer après avoir marché en novembre.", ''],
  ['guiling', 'dessert', '*', 0, 0, 'Gelée noire aux herbes', '龟苓膏', 'guīlínggāo',
    "Une gelée sombre faite d'herbes médicinales, légèrement amère, qu'on mange avec du sirop ou du miel. Réputée « rafraîchissante » : on la considère comme un dessert-médecine.", ''],
];

const PL_DATA = PL_BRUT.map(r => {
  const cat = PL_CATS.find(c => c.k === r[1]);
  const mesure = r[10] || cat.mesure;
  return {
    id: r[0], cat: r[1], villes: r[2].split(','), p: r[3], top: !!r[4], fr: r[5], zh: r[6], py: r[7],
    d: r[8], tip: r[9] || '', mesure, ou: r[11] || '',
  };
});

/* ───────────── État et stockage ───────────── */
const PL = { fait: {}, cat: 'tout', ville: '', etat: 'tous', q: '', liste: [], ouvert: '', sale: false };
const plEl = id => document.getElementById(id);
const plLire = (k, def) => { try { const v = localStorage.getItem(k); return v === null ? def : v; } catch (e) { return def; } };
const plEcrire = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* stockage indisponible : tant pis */ } };
function plCharger() {
  try { const o = JSON.parse(plLire('plats_faits', '{}')); PL.fait = o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (e) { PL.fait = {}; }
  Object.keys(PL.fait).forEach(id => { if (!PL_DATA.some(x => x.id === id)) delete PL.fait[id]; });
}
const plSauver = () => plEcrire('plats_faits', JSON.stringify(PL.fait));
const plNorm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const plDateCourte = iso => { try { return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }); } catch (e) { return ''; } };
const plLieu = x => x.ou || (x.villes.includes('*') ? PL_VILLES['*'] : x.villes.map(v => PL_VILLES[v]).filter(Boolean).join(' · '));
const plPiment = n => `<span class="pl-piment" title="${esc(PL_PIMENT[n])}">${n ? Array.from({ length: n }, () => ic('chili')).join('') : ''}<em>${esc(PL_PIMENT[n])}</em></span>`;
const plCat = k => PL_CATS.find(c => c.k === k);

/* ───────────── Onglet et tiroir ───────────── */
function plEnsureTab() {
  if (plEl('tab-nourriture')) return;
  const main = plEl('mainContent'); if (!main) return;
  const tab = document.createElement('div');
  tab.className = 'tab'; tab.id = 'tab-nourriture';
  tab.innerHTML = `
    <div class="ph"><h1>Nourriture</h1><p id="plSub">Ce qu'il faut goûter en Chine</p></div>
    <div id="plBilan"></div>
    <div class="pl-rech"><span class="pl-rech-ic">${ic('search')}</span>
      <input id="plQ" type="search" inputmode="search" placeholder="Un plat, un mot, un caractère…" autocomplete="off" enterkeyhint="search" aria-label="Rechercher un plat">
    </div>
    <div class="sh-chips" id="plCats"></div>
    <div class="sh-chips sh-pers" id="plVilles"></div>
    <div class="sh-chips" id="plEtats"></div>
    <div id="plListe"></div>`;
  main.appendChild(tab);
  tab.addEventListener('click', plClic);
  plEl('plQ').addEventListener('input', e => { PL.q = e.target.value; plRendreListe(); });

  const grid = document.querySelector('#navDrawer .nav-drawer-grid');
  if (grid && !plEl('nd-nourriture')) {
    const b = document.createElement('button');
    b.className = 'nav-drawer-btn'; b.id = 'nd-nourriture'; b.type = 'button';
    b.onclick = () => { goTab('nourriture', plEl('nb-more')); closeNavDrawer(); };
    b.innerHTML = `<span class="nav-drawer-ic">${ic('skewer')}</span><span class="nav-drawer-lbl">Nourriture</span>`;
    const apres = plEl('nd-restaurants');
    if (apres && apres.parentNode === grid) grid.insertBefore(b, apres.nextSibling); else grid.appendChild(b);
  }

  const full = document.createElement('div');
  full.id = 'pl-full'; full.className = 'pl-full'; full.setAttribute('role', 'dialog'); full.setAttribute('aria-modal', 'true'); full.hidden = true;
  document.body.appendChild(full);
  full.addEventListener('click', plClic);
}

function plClic(e) {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const id = el.dataset.id;
  switch (el.dataset.act) {
    case 'ouvrir': plOuvrir(id); break;
    case 'cocher': e.stopPropagation(); plCocher(id); break;
    case 'cat': PL.cat = el.dataset.v; plRendreFiltres(); plRendreListe(); plVersLaListe(); break;
    case 'ville': PL.ville = PL.ville === el.dataset.v ? '' : el.dataset.v; plRendreFiltres(); plRendreListe(); break;
    case 'etat': PL.etat = el.dataset.v; plRendreFiltres(); plRendreListe(); break;
    case 'hasard': plHasard(); break;
    case 'fermer': plFermer(); break;
    case 'prec': plVoisin(-1); break;
    case 'suiv': plVoisin(1); break;
    case 'raz': PL.cat = 'tout'; PL.ville = ''; PL.etat = 'tous'; PL.q = ''; { const q = plEl('plQ'); if (q) q.value = ''; } plRendreFiltres(); plRendreListe(); break;
  }
}

// Les filtres sont sous la carte de progression : après un choix de catégorie, on amène la liste en haut de l'écran.
function plVersLaListe() {
  const l = plEl('plListe'); if (!l) return;
  const y = l.getBoundingClientRect().top + window.scrollY - 150;
  if (y > window.scrollY + 40) window.scrollTo({ top: y, behavior: 'smooth' });
}

/* ───────────── Coche ───────────── */
function plCocher(id) {
  const x = PL_DATA.find(p => p.id === id); if (!x) return;
  if (PL.fait[id]) delete PL.fait[id];
  else {
    const d = new Date();
    PL.fait[id] = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (typeof showToast === 'function') showToast(`Goûté : ${x.zh}`);
  }
  plSauver();
  plRendreBilan();
  if (PL.ouvert === id) plRendreDetail(id);
  if (PL.ouvert) PL.sale = true; else plRendreListe();   // liste redessinée à la fermeture si la fiche est ouverte
}

/* ───────────── Rendu ───────────── */
function plRendre() { plRendreBilan(); plRendreFiltres(); plRendreListe(); }

function plRendreBilan() {
  const b = plEl('plBilan'); if (!b) return;
  const n = PL_DATA.length, f = Object.keys(PL.fait).length;
  const pct = n ? Math.round(f / n * 100) : 0;
  const sub = plEl('plSub'); if (sub) sub.textContent = `${n} choses à goûter`;
  b.innerHTML = `<div class="rs-bilan pl-bilan">
      <div class="rs-bilan-top"><b>${f} sur ${n} goûtés</b><span>${f ? (f === n ? 'Tout est coché, bravo.' : `Il en reste ${n - f}. Appuie sur « Surprends-moi » pour en tirer un au hasard.`) : "Rien de coché pour l'instant. Coche chaque plat quand vous l'avez goûté."}</span></div>
      <div class="rs-bar"><i style="width:${pct}%"></i></div>
      <button class="pl-hasard" type="button" data-act="hasard">${ic('sparkle')}<span>Surprends-moi</span></button>
    </div>`;
}

function plRendreFiltres() {
  const cats = plEl('plCats'), villes = plEl('plVilles'), etats = plEl('plEtats'); if (!cats) return;
  const nbCat = k => PL_DATA.filter(x => x.cat === k).length;
  cats.innerHTML = `<button class="sh-chip${PL.cat === 'tout' ? ' on' : ''}" type="button" data-act="cat" data-v="tout">Tout <span class="pl-n">${PL_DATA.length}</span></button>` +
    PL_CATS.map(c => `<button class="sh-chip pl-chip${PL.cat === c.k ? ' on' : ''}" type="button" data-act="cat" data-v="${c.k}">${ic(c.ic)}<span>${esc(c.court)}</span><span class="pl-n">${nbCat(c.k)}</span></button>`).join('');
  villes.innerHTML = PL_VILLES_CHIPS.map(([k, nom]) => `<button class="sh-chip${PL.ville === k ? ' on' : ''}" type="button" data-act="ville" data-v="${k}">${esc(nom)}</button>`).join('');
  etats.innerHTML = [['tous', 'Tous'], ['afaire', 'À goûter'], ['faits', 'Goûtés'], ['top', 'Incontournables']]
    .map(([k, nom]) => `<button class="sh-chip${PL.etat === k ? ' on' : ''}" type="button" data-act="etat" data-v="${k}">${esc(nom)}</button>`).join('');
}

function plFiltrer() {
  const q = plNorm(PL.q).trim();
  return PL_DATA.filter(x => {
    if (PL.cat !== 'tout' && x.cat !== PL.cat) return false;
    if (PL.ville && !x.villes.includes(PL.ville) && !x.villes.includes('*')) return false;
    if (PL.etat === 'afaire' && PL.fait[x.id]) return false;
    if (PL.etat === 'faits' && !PL.fait[x.id]) return false;
    if (PL.etat === 'top' && !x.top) return false;
    if (q) {
      const foin = plNorm([x.fr, x.zh, x.py, x.d, plLieu(x), plCat(x.cat).nom].join(' '));
      if (!q.split(/\s+/).every(m => foin.includes(m))) return false;
    }
    return true;
  });
}

function plCarte(x) {
  const ok = !!PL.fait[x.id];
  return `<article class="pl-card${ok ? ' ok' : ''}" data-act="ouvrir" data-id="${esc(x.id)}" role="button" tabindex="0" aria-label="Voir la fiche : ${esc(x.fr)}">
    <button class="pl-box" type="button" data-act="cocher" data-id="${esc(x.id)}" aria-pressed="${ok}" aria-label="${ok ? 'Retirer des plats goûtés' : 'Marquer comme goûté'} : ${esc(x.fr)}">${ic('check')}</button>
    <div class="pl-body">
      <div class="pl-zh">${esc(x.zh)}${x.top ? `<span class="pl-top" title="Incontournable">${ic('star-fill')}</span>` : ''}</div>
      <div class="pl-fr">${esc(x.fr)}</div>
      <div class="pl-py">${esc(x.py)}</div>
      <p class="pl-d">${esc(x.d)}</p>
      <div class="pl-meta"><span class="pl-lieu">${ic('pin')}<span>${esc(plLieu(x))}</span></span>${plPiment(x.p)}</div>
    </div>
    <span class="pl-chev" aria-hidden="true">${ic('arrow-up')}</span>
  </article>`;
}

function plRendreListe() {
  const cont = plEl('plListe'); if (!cont) return;
  const liste = plFiltrer();
  PL.liste = liste.map(x => x.id);
  if (!liste.length) {
    cont.innerHTML = `<div class="sh-vide"><p>Rien ne correspond à ces filtres.</p><button class="pl-hasard" type="button" data-act="raz"><span>Tout réafficher</span></button></div>`;
    return;
  }
  let html = '';
  PL_CATS.forEach(c => {
    const l = liste.filter(x => x.cat === c.k); if (!l.length) return;
    const f = l.filter(x => PL.fait[x.id]).length;
    html += `<div class="rs-sec pl-sec">${ic(c.ic)}<span>${esc(c.nom)}</span><em>${f}/${l.length}</em></div>` + l.map(plCarte).join('');
  });
  cont.innerHTML = html;
}

/* ───────────── Plein écran ───────────── */
function plPhrase(x) {
  const [mz, mp, mf] = x.mesure;
  return { zh: `我想要${mz}${x.zh}`, py: `Wǒ xiǎng yào ${mp} ${x.py}`, fr: `« Je voudrais ${mf} ${x.py}. »` };
}
function plTailleZh(s) { const n = [...s].length; return n <= 3 ? '5rem' : n <= 4 ? '4rem' : n <= 6 ? '3rem' : '2.3rem'; }

function plRendreDetail(id) {
  const x = PL_DATA.find(p => p.id === id); const full = plEl('pl-full'); if (!x || !full) return;
  const c = plCat(x.cat), fait = PL.fait[x.id], ph = plPhrase(x);
  const pos = PL.liste.indexOf(id), tot = PL.liste.length;
  full.innerHTML = `
    <div class="pl-f-bar">
      <button class="pl-f-btn" type="button" data-act="fermer" aria-label="Fermer la fiche">${ic('x')}</button>
      <span class="pl-f-pos">${pos >= 0 ? `${pos + 1} / ${tot}` : ''}</span>
      <button class="pl-f-btn" type="button" data-act="prec" aria-label="Fiche précédente" ${pos <= 0 ? 'disabled' : ''}><span class="pl-rot-l">${ic('arrow-up')}</span></button>
      <button class="pl-f-btn" type="button" data-act="suiv" aria-label="Fiche suivante" ${pos < 0 || pos >= tot - 1 ? 'disabled' : ''}><span class="pl-rot-r">${ic('arrow-up')}</span></button>
    </div>
    <div class="pl-f-scroll">
      <header class="pl-f-hero">
        <div class="pl-f-cat">${ic(c.ic)}<span>${esc(c.nom)}</span></div>
        <div class="pl-f-zh" lang="zh-Hans" style="font-size:${plTailleZh(x.zh)}">${esc(x.zh)}</div>
        <div class="pl-f-py">${esc(x.py)}</div>
        <h2 class="pl-f-fr">${esc(x.fr)}</h2>
        <div class="pl-f-tags">
          <span class="pl-tag">${ic('pin')}<span>${esc(plLieu(x))}</span></span>
          <span class="pl-tag">${x.p ? ic('chili') : ic('sprout')}<span>${esc(PL_PIMENT[x.p])}</span></span>
          ${x.top ? `<span class="pl-tag or">${ic('star-fill')}<span>Incontournable</span></span>` : ''}
        </div>
      </header>
      <section class="pl-f-sec"><h3>C'est quoi ?</h3><p>${esc(x.d)}</p></section>
      ${x.tip ? `<section class="pl-f-sec tip"><h3>${ic('bulb')}<span>À savoir</span></h3><p>${esc(x.tip)}</p></section>` : ''}
      <section class="pl-f-sec say"><h3>${ic('speaker')}<span>À montrer au serveur</span></h3>
        <div class="pl-say-zh" lang="zh-Hans">${esc(ph.zh)}</div>
        <div class="pl-say-py">${esc(ph.py)}</div>
        <div class="pl-say-fr">${esc(ph.fr)}</div>
      </section>
      <div style="height:96px"></div>
    </div>
    <div class="pl-f-foot">
      <button class="pl-f-do${fait ? ' ok' : ''}" type="button" data-act="cocher" data-id="${esc(x.id)}" aria-pressed="${!!fait}">${ic(fait ? 'check-circle' : 'check')}<span>${fait ? `Goûté le ${esc(plDateCourte(fait))}` : "On l'a goûté"}</span></button>
    </div>`;
  const sc = full.querySelector('.pl-f-scroll'); if (sc) sc.scrollTop = 0;
}

function plOuvrir(id) {
  const full = plEl('pl-full'); if (!full) return;
  if (!PL.liste.includes(id)) PL.liste = [id];
  PL.ouvert = id;
  plRendreDetail(id);
  full.hidden = false;
  document.body.style.overflow = 'hidden';
  full.querySelector('[data-act="fermer"]')?.focus({ preventScroll: true });
}
function plFermer() {
  const full = plEl('pl-full'); if (!full) return;
  full.hidden = true; PL.ouvert = '';
  document.body.style.overflow = '';
  if (PL.sale) { PL.sale = false; plRendreListe(); }
}
function plVoisin(sens) {
  const i = PL.liste.indexOf(PL.ouvert); if (i < 0) return;
  const n = PL.liste[i + sens]; if (!n) return;
  PL.ouvert = n; plRendreDetail(n);
}
function plHasard() {
  const base = plFiltrer().filter(x => !PL.fait[x.id]);
  const l = base.length ? base : PL_DATA.filter(x => !PL.fait[x.id]);
  if (!l.length) { if (typeof showToast === 'function') showToast('Tout est déjà goûté'); return; }
  const x = l[Math.floor(Math.random() * l.length)];
  if (!PL.liste.includes(x.id)) PL.liste = [x.id];
  plOuvrir(x.id);
}

document.addEventListener('keydown', e => {
  if (!PL.ouvert) return;
  if (e.key === 'Escape') plFermer();
  else if (e.key === 'ArrowLeft') plVoisin(-1);
  else if (e.key === 'ArrowRight') plVoisin(1);
});
document.addEventListener('keydown', e => {   // carte au clavier
  const c = e.target.closest && e.target.closest('.pl-card');
  if (c && e.target === c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); plOuvrir(c.dataset.id); }
});

/* ───────────── Branchement sur la navigation ───────────── */
plCharger();
plEnsureTab();
{
  const _goTab = goTab;
  goTab = function (n, el) {
    if (n !== 'nourriture') plFermer();
    _goTab(n, el);
    if (n !== 'nourriture') return;
    plEl('nb-more')?.classList.add('on');
    plEl('nd-nourriture')?.classList.add('active');
    plRendre();
  };
}

/* ───────────── Styles ───────────── */
document.head.insertAdjacentHTML('beforeend', `<style>
#tab-nourriture .ph h1::after{content:'吃'}#tab-nourriture .ph::before{content:'尝'}
.pl-rech{position:relative;margin:0 16px 10px}
.pl-rech-ic{position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--txt3);display:flex;pointer-events:none}
.pl-rech-ic .gi{width:18px;height:18px}
.pl-rech input{width:100%;box-sizing:border-box;padding:12px 14px 12px 42px;border-radius:999px;border:1.5px solid var(--border);background:#fff;font:500 .86rem var(--font);color:var(--txt);outline:none}
.pl-rech input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--tint)}
.pl-chip .gi{width:15px;height:15px;margin-right:5px;vertical-align:-3px}
.pl-chip{display:inline-flex;align-items:center}
.pl-n{margin-left:6px;font-size:.64rem;opacity:.6;font-weight:700}
.pl-bilan{position:relative}
.pl-hasard{display:inline-flex;align-items:center;justify-content:center;gap:7px;margin-top:11px;min-height:40px;padding:0 18px;border:none;border-radius:999px;background:var(--accent);color:#fff;font:700 .8rem var(--font-title);cursor:pointer;box-shadow:var(--glow)}
.pl-hasard .gi{width:17px;height:17px}
.pl-hasard:active{transform:scale(.97);background:var(--accent-deep)}
.pl-sec .gi{width:17px;height:17px;color:var(--accent)}
.pl-card{position:relative;display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:start;margin:0 16px 10px;padding:13px 12px 12px 12px;background:#fffdf8;border:1px solid rgba(184,137,58,.45);border-radius:18px;box-shadow:var(--shadow-sm);cursor:pointer;-webkit-tap-highlight-color:transparent}
.pl-card:active{transform:scale(.99)}
.pl-card:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.pl-box{width:32px;height:32px;margin-top:2px;border-radius:50%;border:2px solid var(--border2,#cdbfb0);background:#fff;color:transparent;display:grid;place-items:center;cursor:pointer;flex:none;padding:0}
.pl-box .gi{width:18px;height:18px}
.pl-box:active{transform:scale(.9)}
.pl-card.ok .pl-box{background:var(--green);border-color:var(--green);color:#fff}
.pl-card.ok .pl-body{opacity:.72}
.pl-card.ok .pl-fr{text-decoration:line-through;text-decoration-color:rgba(31,20,17,.35)}
.pl-body{min-width:0}
.pl-zh{display:flex;align-items:center;gap:8px;font:700 1.35rem/1.2 'STKaiti','KaiTi','Kaiti SC','Noto Serif SC','Songti SC','SimSun','Microsoft YaHei',serif;color:var(--laque);letter-spacing:.06em;overflow-wrap:anywhere}
.pl-top{display:inline-flex;color:var(--or,#b8893a)}
.pl-top .gi{width:15px;height:15px}
.pl-fr{margin-top:3px;font:700 .95rem/1.3 var(--font-title);color:var(--txt);overflow-wrap:anywhere}
.pl-py{margin-top:1px;font-size:.76rem;color:var(--txt3);font-style:italic}
.pl-d{margin:6px 0 0;font-size:.8rem;line-height:1.5;color:var(--txt2);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.pl-meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;margin-top:9px}
.pl-lieu{display:inline-flex;align-items:center;gap:4px;font-size:.7rem;font-weight:600;color:var(--txt2)}
.pl-lieu .gi{width:13px;height:13px;color:var(--accent)}
.pl-piment{display:inline-flex;align-items:center;gap:2px;font-size:.7rem;font-weight:600;color:var(--txt2)}
.pl-piment .gi{width:14px;height:14px;color:var(--laque)}
.pl-piment em{font-style:normal;margin-left:3px}
.pl-py,.pl-f-py,.pl-say-py{font-family:'Segoe UI','Roboto','Helvetica Neue',Arial,system-ui,sans-serif}
.pl-chev{align-self:center;color:var(--txt3);display:flex;transform:rotate(90deg)}
.pl-chev .gi{width:16px;height:16px}

/* plein écran */
.pl-full{position:fixed;inset:0;z-index:2600;display:flex;flex-direction:column;background:var(--bg) var(--p-lattice);background-size:44px;overscroll-behavior:contain}
.pl-full[hidden]{display:none}
.pl-f-bar{display:flex;align-items:center;gap:10px;padding:calc(10px + env(safe-area-inset-top,0px)) 14px 10px;background:rgba(251,246,236,.94);backdrop-filter:blur(8px);border-bottom:1px solid var(--border)}
.pl-f-pos{flex:1;text-align:center;font:700 .76rem var(--font);color:var(--txt2);letter-spacing:.04em}
.pl-f-btn{width:42px;height:42px;border-radius:50%;border:1px solid var(--border);background:#fff;color:var(--txt);display:grid;place-items:center;cursor:pointer;padding:0}
.pl-f-btn .gi{width:19px;height:19px}
.pl-f-btn:disabled{opacity:.35;cursor:default}
.pl-f-btn:active:not(:disabled){transform:scale(.93)}
.pl-rot-l,.pl-rot-r{display:flex}
.pl-rot-l{transform:rotate(-90deg)}.pl-rot-r{transform:rotate(90deg)}
.pl-f-scroll{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding-bottom:20px}
.pl-f-hero{position:relative;margin:14px 16px 12px;padding:22px 16px 18px;text-align:center;border-radius:26px;background:var(--p-lattice),linear-gradient(180deg,#fffdf8,#fbf3e2);border:1px solid rgba(184,137,58,.55);box-shadow:var(--shadow-sm),inset 0 0 0 4px #fff,inset 0 0 0 5px rgba(184,137,58,.25)}
.pl-f-cat{display:inline-flex;align-items:center;gap:7px;font:700 .66rem var(--font);letter-spacing:.1em;text-transform:uppercase;color:var(--txt2)}
.pl-f-cat .gi{width:16px;height:16px;color:var(--accent)}
.pl-f-zh{margin:10px 0 2px;font-family:'STKaiti','KaiTi','Kaiti SC','Noto Serif SC','Songti SC','SimSun','Microsoft YaHei',serif;font-weight:700;line-height:1.15;color:var(--laque);letter-spacing:.08em;overflow-wrap:anywhere}
.pl-f-py{font:600 1.05rem var(--font);color:var(--txt2);font-style:italic}
.pl-f-fr{margin:12px 0 0;font:700 1.15rem/1.3 var(--font-title);letter-spacing:-.02em;color:var(--txt)}
.pl-f-tags{display:flex;flex-wrap:wrap;justify-content:center;gap:7px;margin-top:14px}
.pl-tag{display:inline-flex;align-items:center;gap:5px;padding:5px 11px;border-radius:999px;background:#fff;border:1px solid var(--border);font:600 .72rem var(--font);color:var(--txt2)}
.pl-tag .gi{width:14px;height:14px;color:var(--accent)}
.pl-tag.or{background:#fbf0d6;border-color:rgba(184,137,58,.5);color:#7a5612}
.pl-tag.or .gi{color:#b8893a}
.pl-f-sec{margin:0 16px 12px;padding:14px 16px;border-radius:20px;background:#fffdf8;border:1px solid rgba(184,137,58,.4)}
.pl-f-sec h3{display:flex;align-items:center;gap:7px;margin:0 0 7px;font:700 .72rem var(--font);letter-spacing:.1em;text-transform:uppercase;color:var(--txt2)}
.pl-f-sec h3 .gi{width:16px;height:16px;color:var(--accent)}
.pl-f-sec p{margin:0;font-size:.92rem;line-height:1.62;color:var(--txt)}
.pl-f-sec.tip{background:#fbf3e2}
.pl-f-sec.say{text-align:center;background:#fff}
.pl-say-zh{margin:4px 0 4px;font:700 1.7rem/1.3 'STKaiti','KaiTi','Kaiti SC','Noto Serif SC','Songti SC','SimSun','Microsoft YaHei',serif;color:var(--laque);overflow-wrap:anywhere}
.pl-say-py{font:600 .88rem var(--font);font-style:italic;color:var(--txt2)}
.pl-say-fr{margin-top:6px;font-size:.8rem;color:var(--txt3)}
.pl-f-foot{position:absolute;left:0;right:0;bottom:0;padding:12px 16px calc(14px + env(safe-area-inset-bottom,0px));background:linear-gradient(180deg,rgba(251,246,236,0),var(--bg) 40%)}
.pl-f-do{display:flex;align-items:center;justify-content:center;gap:9px;width:100%;min-height:52px;border:none;border-radius:999px;background:var(--accent);color:#fff;font:700 .98rem var(--font-title);cursor:pointer;box-shadow:var(--glow)}
.pl-f-do .gi{width:21px;height:21px}
.pl-f-do:active{transform:scale(.985);background:var(--accent-deep)}
.pl-f-do.ok{background:var(--green);box-shadow:0 8px 20px rgba(31,166,122,.28)}
@media (prefers-reduced-motion:reduce){.pl-card:active,.pl-f-do:active,.pl-hasard:active{transform:none}}
</style>`);
