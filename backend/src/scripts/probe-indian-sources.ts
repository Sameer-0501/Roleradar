import 'dotenv/config';
import { parseExperienceRequirements } from '../matching/experience-parser.js';
import { SOURCE_CATALOG } from '../sources/catalog.js';

interface ProbeTarget {
  name: string;
  category: string;
  officialDomain: string;
  tokens: {
    greenhouse?: string[];
    lever?: string[];
    ashby?: string[];
    smartrecruiters?: string[];
    workable?: string[];
  };
}

const CANDIDATES: ProbeTarget[] = [
  // Indian Product & SaaS & Fintech
  { name: 'Razorpay', category: 'Fintech', officialDomain: 'razorpay.com', tokens: { greenhouse: ['razorpay', 'razorpaysoftware'], lever: ['razorpay'], ashby: ['razorpay'] } },
  { name: 'CRED', category: 'Fintech', officialDomain: 'cred.club', tokens: { greenhouse: ['cred', 'dreamplug'], lever: ['cred', 'dreamplugtechnologies'] } },
  { name: 'PhonePe', category: 'Fintech', officialDomain: 'phonepe.com', tokens: { greenhouse: ['phonepe'], lever: ['phonepe'], ashby: ['phonepe'] } },
  { name: 'Zepto', category: 'E-commerce', officialDomain: 'zeptonow.com', tokens: { greenhouse: ['zepto', 'kiranakart'], lever: ['zepto', 'zeptonow'] } },
  { name: 'Swiggy', category: 'FoodTech', officialDomain: 'swiggy.com', tokens: { greenhouse: ['swiggy', 'bundl'], lever: ['swiggy'] } },
  { name: 'Zomato', category: 'FoodTech', officialDomain: 'zomato.com', tokens: { greenhouse: ['zomato', 'eternal'], lever: ['zomato', 'eternal'] } },
  { name: 'Freshworks', category: 'SaaS', officialDomain: 'freshworks.com', tokens: { smartrecruiters: ['freshworks'], greenhouse: ['freshworks'] } },
  { name: 'BrowserStack', category: 'DevTech', officialDomain: 'browserstack.com', tokens: { greenhouse: ['browserstack'], lever: ['browserstack'] } },
  { name: 'Postman', category: 'DevTech', officialDomain: 'postman.com', tokens: { greenhouse: ['postman'], lever: ['postman'], ashby: ['postman'] } },
  { name: 'Chargebee', category: 'SaaS', officialDomain: 'chargebee.com', tokens: { greenhouse: ['chargebee'], lever: ['chargebee'] } },
  { name: 'Zoho', category: 'SaaS', officialDomain: 'zoho.com', tokens: { greenhouse: ['zoho'], lever: ['zoho'] } },
  { name: 'Zerodha', category: 'Fintech', officialDomain: 'zerodha.com', tokens: { greenhouse: ['zerodha'], lever: ['zerodha'] } },
  { name: 'Juspay', category: 'Fintech', officialDomain: 'juspay.in', tokens: { greenhouse: ['juspay'], lever: ['juspay'], ashby: ['juspay'] } },
  { name: 'Darwinbox', category: 'SaaS', officialDomain: 'darwinbox.com', tokens: { greenhouse: ['darwinbox'], lever: ['darwinbox'], smartrecruiters: ['darwinbox'] } },
  { name: 'Hasura', category: 'DevTech', officialDomain: 'hasura.io', tokens: { greenhouse: ['hasura'], lever: ['hasura'], ashby: ['hasura'] } },
  { name: 'Whatfix', category: 'SaaS', officialDomain: 'whatfix.com', tokens: { greenhouse: ['whatfix'], lever: ['whatfix'] } },
  { name: 'InMobi', category: 'AdTech', officialDomain: 'inmobi.com', tokens: { greenhouse: ['inmobi', 'inmobius'], lever: ['inmobi'] } },
  { name: 'Dream11', category: 'Gaming', officialDomain: 'dream11.com', tokens: { greenhouse: ['dream11', 'dreamsports'], lever: ['dream11', 'dreamsports'] } },
  { name: 'Paytm', category: 'Fintech', officialDomain: 'paytm.com', tokens: { lever: ['paytm', 'one97'], greenhouse: ['paytm', 'one97'] } },
  { name: 'Pine Labs', category: 'Fintech', officialDomain: 'pinelabs.com', tokens: { greenhouse: ['pinelabs'], lever: ['pinelabs'], smartrecruiters: ['pinelabs'] } },
  { name: 'Cashfree', category: 'Fintech', officialDomain: 'cashfree.com', tokens: { greenhouse: ['cashfree', 'cashfreepayments'], lever: ['cashfree', 'cashfreepayments'], ashby: ['cashfree'] } },
  { name: 'Epifi', category: 'Fintech', officialDomain: 'fi.money', tokens: { greenhouse: ['epifi', 'fi'], lever: ['epifi', 'fi'] } },
  // AI / Data Startups
  { name: 'Observe.AI', category: 'AI', officialDomain: 'observe.ai', tokens: { greenhouse: ['observeai', 'observe'], lever: ['observeai'] } },
  { name: 'Atlan', category: 'Data', officialDomain: 'atlan.com', tokens: { greenhouse: ['atlan'], lever: ['atlan'], ashby: ['atlan'] } },
  { name: 'Uniphore', category: 'AI', officialDomain: 'uniphore.com', tokens: { greenhouse: ['uniphore'], lever: ['uniphore'] } },
  { name: 'Yellow.ai', category: 'AI', officialDomain: 'yellow.ai', tokens: { greenhouse: ['yellowai', 'yellowmessenger'], lever: ['yellowai'] } },
  { name: 'Fractal', category: 'AI/Data', officialDomain: 'fractal.ai', tokens: { greenhouse: ['fractal', 'fractalanalytics'], lever: ['fractal', 'fractalanalytics'] } },
  { name: 'Sigmoid', category: 'Data', officialDomain: 'sigmoid.com', tokens: { greenhouse: ['sigmoid', 'sigmoidanalytics'], lever: ['sigmoid'] } },
  { name: 'Sarvam AI', category: 'AI', officialDomain: 'sarvam.ai', tokens: { greenhouse: ['sarvam', 'sarvamai'], ashby: ['sarvam', 'sarvamai'], lever: ['sarvam', 'sarvamai'] } },
  { name: 'Krutrim', category: 'AI', officialDomain: 'krutrim.com', tokens: { greenhouse: ['krutrim', 'olakrutrim'], lever: ['krutrim'] } },
  { name: 'DevRev', category: 'DevTech', officialDomain: 'devrev.ai', tokens: { ashby: ['devrev'] } },
  { name: 'Sprinto', category: 'Security/SaaS', officialDomain: 'sprinto.com', tokens: { ashby: ['sprinto'], greenhouse: ['sprinto'], lever: ['sprinto'] } },
  { name: 'Khatabook', category: 'Fintech', officialDomain: 'khatabook.com', tokens: { greenhouse: ['khatabook'], lever: ['khatabook'] } },
  { name: 'Urban Company', category: 'Consumer Tech', officialDomain: 'urbancompany.com', tokens: { greenhouse: ['urbancompany'], lever: ['urbancompany', 'urbanclap'] } },
  { name: 'Licious', category: 'Consumer Tech', officialDomain: 'licious.in', tokens: { greenhouse: ['licious'], lever: ['licious'] } },
  { name: 'Spinny', category: 'Consumer Tech', officialDomain: 'spinny.com', tokens: { greenhouse: ['spinny'], lever: ['spinny'] } },
  { name: 'Cars24', category: 'Consumer Tech', officialDomain: 'cars24.com', tokens: { greenhouse: ['cars24'], lever: ['cars24'] } },
  { name: 'Navi', category: 'Fintech', officialDomain: 'navi.com', tokens: { greenhouse: ['navi', 'navitechnologies'], lever: ['navi', 'navitechnologies'] } },
  { name: 'Lendingkart', category: 'Fintech', officialDomain: 'lendingkart.com', tokens: { greenhouse: ['lendingkart'], lever: ['lendingkart'] } },
  { name: 'CleverTap', category: 'SaaS', officialDomain: 'clevertap.com', tokens: { greenhouse: ['clevertap'], lever: ['clevertap'] } },
  { name: 'MoEngage', category: 'SaaS', officialDomain: 'moengage.com', tokens: { greenhouse: ['moengage'], lever: ['moengage'] } },
  { name: 'LeadSquared', category: 'SaaS', officialDomain: 'leadsquared.com', tokens: { greenhouse: ['leadsquared'], lever: ['leadsquared'] } },
  { name: 'SenseHQ', category: 'HR Tech', officialDomain: 'sensehq.com', tokens: { greenhouse: ['sense', 'sensehq'], lever: ['sense'] } },
  { name: 'Loco', category: 'Gaming', officialDomain: 'loco.gg', tokens: { greenhouse: ['loco'], lever: ['loco'] } },
  { name: 'mpl', category: 'Gaming', officialDomain: 'mpl.live', tokens: { greenhouse: ['mpl', 'mobilepremierleague'], lever: ['mpl'] } },
  { name: 'Games24x7', category: 'Gaming', officialDomain: 'games24x7.com', tokens: { greenhouse: ['games24x7'], lever: ['games24x7'] } },
  { name: 'CoinSwitch', category: 'Fintech', officialDomain: 'coinswitch.co', tokens: { greenhouse: ['coinswitch', 'coinswitchkuber'], lever: ['coinswitch'] } },
  { name: 'CoinDCX', category: 'Fintech', officialDomain: 'coindcx.com', tokens: { greenhouse: ['coindcx'], lever: ['coindcx'] } },
  { name: 'Kodo', category: 'Fintech', officialDomain: 'kodo.com', tokens: { greenhouse: ['kodo'], lever: ['kodo'], ashby: ['kodo'] } },
  { name: 'Jupiter Money', category: 'Fintech', officialDomain: 'jupiter.money', tokens: { greenhouse: ['jupiter', 'jupitermoney'], lever: ['jupiter', 'jupitermoney'] } },
  { name: 'OneCard', category: 'Fintech', officialDomain: 'getonecard.app', tokens: { greenhouse: ['fpl', 'onecard'], lever: ['fpl', 'onecard'] } },
  { name: 'Klub', category: 'Fintech', officialDomain: 'klubworks.com', tokens: { greenhouse: ['klub'], lever: ['klub'], ashby: ['klub'] } },
  { name: 'Slice', category: 'Fintech', officialDomain: 'sliceit.com', tokens: { greenhouse: ['slice', 'garagepreceptors'], lever: ['slice'] } },
  { name: 'Rupeek', category: 'Fintech', officialDomain: 'rupeek.com', tokens: { greenhouse: ['rupeek'], lever: ['rupeek'] } },
  { name: 'Upstox', category: 'Fintech', officialDomain: 'upstox.com', tokens: { greenhouse: ['upstox', 'rksv'], lever: ['upstox'] } },
  { name: 'PubMatic', category: 'AdTech', officialDomain: 'pubmatic.com', tokens: { greenhouse: ['pubmatic'], smartrecruiters: ['pubmatic'] } },
  { name: 'Druva', category: 'Cloud/Data', officialDomain: 'druva.com', tokens: { greenhouse: ['druva'], lever: ['druva'], smartrecruiters: ['druva'] } },
  { name: 'Icertis', category: 'Enterprise SaaS', officialDomain: 'icertis.com', tokens: { greenhouse: ['icertis'], lever: ['icertis'] } },
  { name: 'Innovaccer', category: 'HealthTech', officialDomain: 'innovaccer.com', tokens: { greenhouse: ['innovaccer'], lever: ['innovaccer'] } },
  { name: 'SirionLabs', category: 'Enterprise SaaS', officialDomain: 'sirionlabs.com', tokens: { greenhouse: ['sirionlabs', 'sirion'], lever: ['sirionlabs'] } },
  { name: 'GreyOrange', category: 'Robotics', officialDomain: 'greyorange.com', tokens: { greenhouse: ['greyorange'], lever: ['greyorange'] } },
  { name: 'FarEye', category: 'Logistics Tech', officialDomain: 'fareye.com', tokens: { greenhouse: ['fareye'], lever: ['fareye'] } },
  { name: 'Shiprocket', category: 'Logistics Tech', officialDomain: 'shiprocket.in', tokens: { greenhouse: ['shiprocket'], lever: ['shiprocket'] } },
  { name: 'Porter', category: 'Logistics Tech', officialDomain: 'porter.in', tokens: { greenhouse: ['porter'], lever: ['porter'] } },
  { name: 'Shadowfax', category: 'Logistics Tech', officialDomain: 'shadowfax.in', tokens: { greenhouse: ['shadowfax'], lever: ['shadowfax'] } },
  { name: 'Delhivery', category: 'Logistics Tech', officialDomain: 'delhivery.com', tokens: { greenhouse: ['delhivery'], lever: ['delhivery'] } },
  { name: 'BlackBuck', category: 'Logistics Tech', officialDomain: 'blackbuck.com', tokens: { greenhouse: ['blackbuck'], lever: ['blackbuck'] } },
  { name: 'Rivigo', category: 'Logistics Tech', officialDomain: 'rivigo.com', tokens: { greenhouse: ['rivigo'], lever: ['rivigo'] } },
  { name: 'Ola', category: 'Mobility Tech', officialDomain: 'olacabs.com', tokens: { greenhouse: ['ola', 'olaelectric', 'ani-technologies'], lever: ['ola', 'olaelectric'] } },
  { name: 'Rapido', category: 'Mobility Tech', officialDomain: 'rapido.bike', tokens: { greenhouse: ['rapido', 'roppen'], lever: ['rapido'] } },
  { name: 'Bounce', category: 'Mobility Tech', officialDomain: 'bounce.inc', tokens: { greenhouse: ['bounce'], lever: ['bounce'] } },
  { name: 'Ather Energy', category: 'EV Tech', officialDomain: 'atherenergy.com', tokens: { greenhouse: ['atherenergy', 'ather'], lever: ['atherenergy'] } },
  { name: 'Ultraviolette', category: 'EV Tech', officialDomain: 'ultraviolette.com', tokens: { greenhouse: ['ultraviolette'], lever: ['ultraviolette'] } },
  { name: 'Cuemath', category: 'EdTech', officialDomain: 'cuemath.com', tokens: { greenhouse: ['cuemath'], lever: ['cuemath'] } },
  { name: 'Eruditus', category: 'EdTech', officialDomain: 'eruditus.com', tokens: { greenhouse: ['eruditus', 'emeritus'], lever: ['eruditus'] } },
  { name: 'Classplus', category: 'EdTech', officialDomain: 'classplusapp.com', tokens: { greenhouse: ['classplus'], lever: ['classplus'] } },
  { name: 'Teachmint', category: 'EdTech', officialDomain: 'teachmint.com', tokens: { greenhouse: ['teachmint'], lever: ['teachmint'] } },
  { name: 'Unacademy', category: 'EdTech', officialDomain: 'unacademy.com', tokens: { greenhouse: ['unacademy', 'sortinghat'], lever: ['unacademy'] } },
  { name: 'PhysicsWallah', category: 'EdTech', officialDomain: 'pw.live', tokens: { greenhouse: ['physicswallah', 'pw'], lever: ['physicswallah'] } },
  { name: 'Practo', category: 'HealthTech', officialDomain: 'practo.com', tokens: { greenhouse: ['practo'], lever: ['practo'] } },
  { name: 'PharmEasy', category: 'HealthTech', officialDomain: 'pharmeasy.in', tokens: { greenhouse: ['pharmeasy'], lever: ['pharmeasy'] } },
  { name: '1mg', category: 'HealthTech', officialDomain: '1mg.com', tokens: { greenhouse: ['1mg', 'tata1mg'], lever: ['1mg'] } },
  { name: 'HealthifyMe', category: 'HealthTech', officialDomain: 'healthifyme.com', tokens: { greenhouse: ['healthifyme'], lever: ['healthifyme'] } },
  { name: 'MediBuddy', category: 'HealthTech', officialDomain: 'medibuddy.in', tokens: { greenhouse: ['medibuddy'], lever: ['medibuddy'] } },
  { name: 'Pristyn Care', category: 'HealthTech', officialDomain: 'pristyncare.com', tokens: { greenhouse: ['pristyncare'], lever: ['pristyncare'] } },
  { name: 'Cult.fit', category: 'HealthTech', officialDomain: 'cult.fit', tokens: { greenhouse: ['curefit', 'cultfit'], lever: ['curefit', 'cultfit'] } },
  { name: 'Clear', category: 'Fintech', officialDomain: 'clear.in', tokens: { greenhouse: ['cleartax', 'clear'], lever: ['cleartax'] } },
  { name: 'Turtlemint', category: 'InsurTech', officialDomain: 'turtlemint.com', tokens: { greenhouse: ['turtlemint'], lever: ['turtlemint'] } },
  { name: 'Digit Insurance', category: 'InsurTech', officialDomain: 'godigit.com', tokens: { greenhouse: ['godigit', 'digit'], lever: ['godigit'] } },
  { name: 'Acko', category: 'InsurTech', officialDomain: 'acko.com', tokens: { greenhouse: ['acko', 'ackotechnology'], lever: ['acko'] } },
  { name: 'Policybazaar', category: 'InsurTech', officialDomain: 'policybazaar.com', tokens: { greenhouse: ['policybazaar', 'pbfintech'], lever: ['policybazaar'] } },
  { name: 'Paisabazaar', category: 'Fintech', officialDomain: 'paisabazaar.com', tokens: { greenhouse: ['paisabazaar'], lever: ['paisabazaar'] } },
  { name: 'Mswipe', category: 'Fintech', officialDomain: 'mswipe.com', tokens: { greenhouse: ['mswipe'], lever: ['mswipe'] } },
  { name: 'BharatPe', category: 'Fintech', officialDomain: 'bharatpe.com', tokens: { greenhouse: ['bharatpe', 'resilient'], lever: ['bharatpe'] } },
  { name: 'Fi Money', category: 'Fintech', officialDomain: 'fi.money', tokens: { greenhouse: ['epifi'], lever: ['epifi'] } },
  { name: 'Uni Cards', category: 'Fintech', officialDomain: 'uni.club', tokens: { greenhouse: ['unicards', 'uni'], lever: ['unicards'] } },
  { name: 'Niyo', category: 'Fintech', officialDomain: 'goniyo.com', tokens: { greenhouse: ['niyo', 'goniyo'], lever: ['niyo'] } },
  { name: 'Open Financial', category: 'Fintech', officialDomain: 'open.money', tokens: { greenhouse: ['openmoney', 'bankopen'], lever: ['openmoney'] } },
  { name: 'Jar', category: 'Fintech', officialDomain: 'myjar.app', tokens: { greenhouse: ['jar', 'myjar'], lever: ['jar', 'myjar'] } },
  { name: 'Plum', category: 'InsurTech', officialDomain: 'plumhq.com', tokens: { greenhouse: ['plum', 'plumhq'], lever: ['plumhq'], ashby: ['plumhq'] } },
  { name: 'Loop Health', category: 'HealthTech', officialDomain: 'loophealth.com', tokens: { greenhouse: ['loophealth'], lever: ['loophealth'], ashby: ['loophealth'] } },
  { name: 'BukuWarung', category: 'Fintech', officialDomain: 'bukuwarung.com', tokens: { greenhouse: ['bukuwarung'], lever: ['bukuwarung'] } },
  { name: 'Signzy', category: 'Fintech', officialDomain: 'signzy.com', tokens: { greenhouse: ['signzy'], lever: ['signzy'] } },
  { name: 'HyperVerge', category: 'AI', officialDomain: 'hyperverge.co', tokens: { greenhouse: ['hyperverge'], lever: ['hyperverge'] } },
  { name: 'Wadhwani AI', category: 'AI', officialDomain: 'wadhwaniai.org', tokens: { greenhouse: ['wadhwaniai'], lever: ['wadhwaniai'] } },
  { name: 'Arya.ai', category: 'AI', officialDomain: 'arya.ai', tokens: { greenhouse: ['aryaai', 'arya'], lever: ['aryaai'] } },
  { name: 'Cognida.ai', category: 'AI', officialDomain: 'cognida.ai', tokens: { greenhouse: ['cognidaai', 'cognida'], lever: ['cognidaai'] } },
  { name: 'Gupshup', category: 'Conversational AI', officialDomain: 'gupshup.io', tokens: { greenhouse: ['gupshup'], lever: ['gupshup'] } },
  { name: 'Verloop.io', category: 'Conversational AI', officialDomain: 'verloop.io', tokens: { greenhouse: ['verloop'], lever: ['verloop'] } },
  { name: 'Haptik', category: 'Conversational AI', officialDomain: 'haptik.ai', tokens: { greenhouse: ['haptik'], lever: ['haptik'] } },
  { name: 'SquadStack', category: 'SaaS', officialDomain: 'squadstack.com', tokens: { greenhouse: ['squadstack', 'squadrun'], lever: ['squadstack'] } },
  { name: 'Scrut Automation', category: 'Security SaaS', officialDomain: 'scrut.io', tokens: { greenhouse: ['scrut', 'scrutautomation'], lever: ['scrutautomation'] } },
  { name: 'Secureframe', category: 'Security SaaS', officialDomain: 'secureframe.com', tokens: { greenhouse: ['secureframe'], lever: ['secureframe'] } },
  { name: 'Wingify', category: 'SaaS', officialDomain: 'wingify.com', tokens: { greenhouse: ['wingify'], lever: ['wingify'] } },
  { name: 'Exotel', category: 'Cloud Comms', officialDomain: 'exotel.com', tokens: { greenhouse: ['exotel'], lever: ['exotel'] } },
  { name: 'Kaleyra', category: 'Cloud Comms', officialDomain: 'kaleyra.com', tokens: { greenhouse: ['kaleyra'], lever: ['kaleyra'] } },
  { name: 'Kommunicate', category: 'SaaS', officialDomain: 'kommunicate.io', tokens: { greenhouse: ['kommunicate'], lever: ['kommunicate'] } },
  { name: 'Appknox', category: 'Security', officialDomain: 'appknox.com', tokens: { greenhouse: ['appknox'], lever: ['appknox'] } },
  { name: 'AccioJob', category: 'EdTech', officialDomain: 'acciojob.com', tokens: { greenhouse: ['acciojob'], lever: ['acciojob'], ashby: ['acciojob'] } },
  { name: 'Masai School', category: 'EdTech', officialDomain: 'masaischool.com', tokens: { greenhouse: ['masaischool'], lever: ['masaischool'] } },
  { name: 'Newton School', category: 'EdTech', officialDomain: 'newtonschool.co', tokens: { greenhouse: ['newtonschool', 'inforex'], lever: ['newtonschool'] } },
  { name: 'Scaler', category: 'EdTech', officialDomain: 'scaler.com', tokens: { greenhouse: ['scaler', 'interviewbit'], lever: ['scaler', 'interviewbit'] } },
  { name: 'GeeksforGeeks', category: 'EdTech', officialDomain: 'geeksforgeeks.org', tokens: { greenhouse: ['geeksforgeeks'], lever: ['geeksforgeeks'] } },
  { name: 'Interview Kickstart', category: 'EdTech', officialDomain: 'interviewkickstart.com', tokens: { greenhouse: ['interviewkickstart'], lever: ['interviewkickstart'] } },
  { name: 'Mudrex', category: 'Fintech', officialDomain: 'mudrex.com', tokens: { greenhouse: ['mudrex'], lever: ['mudrex'], ashby: ['mudrex'] } },
  { name: 'KoinX', category: 'Fintech', officialDomain: 'koinx.id', tokens: { greenhouse: ['koinx'], lever: ['koinx'], ashby: ['koinx'] } },
  { name: 'Karat', category: 'HR Tech', officialDomain: 'karat.com', tokens: { greenhouse: ['karat'], lever: ['karat'] } },
  { name: 'HackerEarth', category: 'HR Tech', officialDomain: 'hackerearth.com', tokens: { greenhouse: ['hackerearth'], lever: ['hackerearth'] } },
  { name: 'Mettl', category: 'HR Tech', officialDomain: 'mettl.com', tokens: { greenhouse: ['mettl'], lever: ['mettl'] } },
  { name: 'Supersourcing', category: 'HR Tech', officialDomain: 'supersourcing.com', tokens: { greenhouse: ['supersourcing'], lever: ['supersourcing'] } },
  { name: 'Pando', category: 'Supply Chain SaaS', officialDomain: 'pando.ai', tokens: { greenhouse: ['pando', 'pandocorp'], lever: ['pando'] } },
  { name: 'Locus.sh', category: 'Supply Chain SaaS', officialDomain: 'locus.sh', tokens: { greenhouse: ['locus', 'locussh'], lever: ['locus'] } },
  { name: 'Freight Tiger', category: 'Logistics Tech', officialDomain: 'freighttiger.com', tokens: { greenhouse: ['freighttiger'], lever: ['freighttiger'] } },
  { name: 'Intugine', category: 'IoT/Logistics', officialDomain: 'intugine.com', tokens: { greenhouse: ['intugine'], lever: ['intugine'] } },
  { name: 'Taggle', category: 'SaaS', officialDomain: 'taggle.com', tokens: { greenhouse: ['taggle'], lever: ['taggle'] } },
  { name: 'Vymo', category: 'SaaS', officialDomain: 'vymo.com', tokens: { greenhouse: ['vymo'], lever: ['vymo'] } },
  { name: 'WebEngage', category: 'SaaS', officialDomain: 'webengage.com', tokens: { greenhouse: ['webengage'], lever: ['webengage'] } },
  { name: 'Netcore', category: 'SaaS', officialDomain: 'netcorecloud.com', tokens: { greenhouse: ['netcore'], lever: ['netcore'] } },
  { name: 'Capillary Technologies', category: 'SaaS', officialDomain: 'capillarytech.com', tokens: { greenhouse: ['capillarytech', 'capillary'], lever: ['capillary'] } },
  { name: 'Ezetap', category: 'Fintech', officialDomain: 'ezetap.com', tokens: { greenhouse: ['ezetap'], lever: ['ezetap'] } },
  { name: 'Fisdom', category: 'Fintech', officialDomain: 'fisdom.com', tokens: { greenhouse: ['fisdom', 'finwizard'], lever: ['fisdom'] } },
  { name: 'Scripbox', category: 'Fintech', officialDomain: 'scripbox.com', tokens: { greenhouse: ['scripbox'], lever: ['scripbox'] } },
  { name: 'Smallcase', category: 'Fintech', officialDomain: 'smallcase.com', tokens: { greenhouse: ['smallcase'], lever: ['smallcase'] } },
  { name: 'INDmoney', category: 'Fintech', officialDomain: 'indmoney.com', tokens: { greenhouse: ['indmoney', 'finzoom'], lever: ['indmoney'] } },
  { name: 'Kuvera', category: 'Fintech', officialDomain: 'kuvera.in', tokens: { greenhouse: ['kuvera'], lever: ['kuvera'] } },
  { name: 'Dezerv', category: 'Fintech', officialDomain: 'dezerv.in', tokens: { greenhouse: ['dezerv'], lever: ['dezerv'], ashby: ['dezerv'] } },
  { name: 'Stable Money', category: 'Fintech', officialDomain: 'stablemoney.in', tokens: { greenhouse: ['stablemoney'], lever: ['stablemoney'], ashby: ['stablemoney'] } },
  { name: 'Wint Wealth', category: 'Fintech', officialDomain: 'wintwealth.com', tokens: { greenhouse: ['wintwealth'], lever: ['wintwealth'], ashby: ['wintwealth'] } },
  { name: 'Suki AI', category: 'AI/Health', officialDomain: 'suki.ai', tokens: { greenhouse: ['suki', 'sukiai'], lever: ['suki'] } },
  { name: 'Kore.ai', category: 'Conversational AI', officialDomain: 'kore.ai', tokens: { greenhouse: ['koreai', 'kore'], lever: ['koreai'] } },
  { name: 'Leena AI', category: 'Conversational AI', officialDomain: 'leena.ai', tokens: { greenhouse: ['leenaai', 'leena'], lever: ['leenaai'] } },
  { name: 'Cohesity', category: 'Data Security', officialDomain: 'cohesity.com', tokens: { greenhouse: ['cohesity'], lever: ['cohesity'] } },
  { name: 'Rubrik', category: 'Data Security', officialDomain: 'rubrik.com', tokens: { greenhouse: ['rubrik'], lever: ['rubrik'] } },
  { name: 'Nutanix', category: 'Cloud Infra', officialDomain: 'nutanix.com', tokens: { greenhouse: ['nutanix'], lever: ['nutanix'] } },
  { name: 'Cloudera', category: 'Enterprise Data', officialDomain: 'cloudera.com', tokens: { greenhouse: ['cloudera'], lever: ['cloudera'] } },
  { name: 'Confluent', category: 'Data Streaming', officialDomain: 'confluent.io', tokens: { greenhouse: ['confluent'], lever: ['confluent'] } },
  { name: 'Databricks', category: 'Data/AI', officialDomain: 'databricks.com', tokens: { greenhouse: ['databricks'], lever: ['databricks'] } },
  { name: 'Snowflake', category: 'Data Cloud', officialDomain: 'snowflake.com', tokens: { greenhouse: ['snowflake'], lever: ['snowflake'] } },
  { name: 'Elastic', category: 'Search/Data', officialDomain: 'elastic.co', tokens: { greenhouse: ['elastic'], lever: ['elastic'] } },
  { name: 'MongoDB', category: 'Database', officialDomain: 'mongodb.com', tokens: { greenhouse: ['mongodb'], lever: ['mongodb'] } },
  { name: 'Couchbase', category: 'Database', officialDomain: 'couchbase.com', tokens: { greenhouse: ['couchbase'], lever: ['couchbase'] } },
  { name: 'Neo4j', category: 'Database', officialDomain: 'neo4j.com', tokens: { greenhouse: ['neo4j'], lever: ['neo4j'] } },
  { name: 'Redis', category: 'Database', officialDomain: 'redis.com', tokens: { greenhouse: ['redis'], lever: ['redis'] } },
  { name: 'SingleStore', category: 'Database', officialDomain: 'singlestore.com', tokens: { greenhouse: ['singlestore', 'memsql'], lever: ['singlestore'] } },
  { name: 'Yugabyte', category: 'Database', officialDomain: 'yugabyte.com', tokens: { greenhouse: ['yugabyte'], lever: ['yugabyte'] } },
  { name: 'PingCap', category: 'Database', officialDomain: 'pingcap.com', tokens: { greenhouse: ['pingcap'], lever: ['pingcap'] } },
  { name: 'LambdaTest', category: 'DevTech', officialDomain: 'lambdatest.com', tokens: { greenhouse: ['lambdatest'], lever: ['lambdatest'] } },
  { name: 'Testsigma', category: 'DevTech', officialDomain: 'testsigma.com', tokens: { greenhouse: ['testsigma'], lever: ['testsigma'], ashby: ['testsigma'] } },
  { name: 'Appsmith', category: 'Low Code', officialDomain: 'appsmith.com', tokens: { greenhouse: ['appsmith'], lever: ['appsmith'], ashby: ['appsmith'] } },
  { name: 'ToolJet', category: 'Low Code', officialDomain: 'tooljet.com', tokens: { greenhouse: ['tooljet'], lever: ['tooljet'], ashby: ['tooljet'] } },
  { name: 'Prisma', category: 'ORM/DevTech', officialDomain: 'prisma.io', tokens: { greenhouse: ['prisma'], ashby: ['prisma'] } },
  { name: 'Harness', category: 'DevOps', officialDomain: 'harness.io', tokens: { greenhouse: ['harness'], lever: ['harness'] } },
  { name: 'Spacelift', category: 'DevOps', officialDomain: 'spacelift.io', tokens: { greenhouse: ['spacelift'], lever: ['spacelift'], ashby: ['spacelift'] } },
  { name: 'GitKraken', category: 'DevTech', officialDomain: 'gitkraken.com', tokens: { greenhouse: ['gitkraken', 'axosoft'], lever: ['gitkraken'] } },
  { name: 'Sourcegraph', category: 'DevTech', officialDomain: 'sourcegraph.com', tokens: { greenhouse: ['sourcegraph'], lever: ['sourcegraph'] } },
  { name: 'Supabase', category: 'DevTech', officialDomain: 'supabase.com', tokens: { ashby: ['supabase'] } },
  { name: 'Resend', category: 'DevTech', officialDomain: 'resend.com', tokens: { ashby: ['resend'] } },
  { name: 'Fly.io', category: 'Cloud', officialDomain: 'fly.io', tokens: { ashby: ['flyio', 'fly-io'] } },
  { name: 'Railway', category: 'Cloud', officialDomain: 'railway.app', tokens: { ashby: ['railway'] } },
  { name: 'Render', category: 'Cloud', officialDomain: 'render.com', tokens: { greenhouse: ['render'], ashby: ['render'] } },
  { name: 'Replit', category: 'DevTech', officialDomain: 'replit.com', tokens: { ashby: ['replit'] } },
  { name: 'Modal', category: 'Cloud/AI', officialDomain: 'modal.com', tokens: { ashby: ['modal', 'modal-labs'] } },
  { name: 'Weights & Biases', category: 'AI/MLOps', officialDomain: 'wandb.ai', tokens: { greenhouse: ['wandb', 'weightsandbiases'], lever: ['wandb'] } },
  { name: 'Anyscale', category: 'AI/MLOps', officialDomain: 'anyscale.com', tokens: { greenhouse: ['anyscale'], ashby: ['anyscale'] } },
  { name: 'Together AI', category: 'AI', officialDomain: 'together.ai', tokens: { ashby: ['togetherai', 'together'] } },
  { name: 'Cohere', category: 'AI', officialDomain: 'cohere.com', tokens: { greenhouse: ['cohere'], ashby: ['cohere'] } },
  { name: 'Anthropic', category: 'AI', officialDomain: 'anthropic.com', tokens: { greenhouse: ['anthropic'], lever: ['anthropic'] } },
  { name: 'Mistral AI', category: 'AI', officialDomain: 'mistral.ai', tokens: { ashby: ['mistral', 'mistralai'] } },
  { name: 'Perplexity AI', category: 'AI', officialDomain: 'perplexity.ai', tokens: { ashby: ['perplexity', 'perplexityai'] } },
  { name: 'Character.AI', category: 'AI', officialDomain: 'character.ai', tokens: { ashby: ['characterai', 'character-ai'], greenhouse: ['characterai'] } },
  { name: 'ElevenLabs', category: 'AI Audio', officialDomain: 'elevenlabs.io', tokens: { ashby: ['elevenlabs', 'eleven-labs'] } },
  { name: 'Midjourney', category: 'AI Image', officialDomain: 'midjourney.com', tokens: { greenhouse: ['midjourney'], ashby: ['midjourney'] } },
  { name: 'Runway', category: 'AI Video', officialDomain: 'runwayml.com', tokens: { ashby: ['runway', 'runwayml'], greenhouse: ['runway'] } },
  { name: 'Synthesia', category: 'AI Video', officialDomain: 'synthesia.io', tokens: { greenhouse: ['synthesia'], lever: ['synthesia'] } },
  { name: 'Writer', category: 'Enterprise AI', officialDomain: 'writer.com', tokens: { ashby: ['writer'] } },
  { name: 'Glean', category: 'Enterprise AI', officialDomain: 'glean.com', tokens: { greenhouse: ['glean'], ashby: ['glean'] } },
  { name: 'Moveworks', category: 'Enterprise AI', officialDomain: 'moveworks.com', tokens: { greenhouse: ['moveworks'], lever: ['moveworks'] } },
  { name: 'Cresta', category: 'Enterprise AI', officialDomain: 'cresta.com', tokens: { greenhouse: ['cresta'], lever: ['cresta'] } },
];

const INDIA_KEYWORDS = [
  'bangalore', 'bengaluru', 'blr',
  'hyderabad', 'hyd',
  'pune',
  'chennai', 'madras',
  'mumbai', 'bombay',
  'delhi', 'ncr', 'noida', 'gurgaon', 'gurugram',
  'india', 'in'
];

function isIndian(locStr: string | null | undefined): boolean {
  if (!locStr) return false;
  const lower = locStr.toLowerCase();
  if (lower.includes('indiana') || lower.includes('in, us') || lower.includes('in, usa') || lower.includes(', in ')) {
    if (!lower.includes('india') && !INDIA_KEYWORDS.slice(0, -2).some(c => lower.includes(c))) return false;
  }
  return INDIA_KEYWORDS.some(k => k === 'in' ? /\b(in|india)\b/i.test(lower) : lower.includes(k));
}

interface ProbeResult {
  company: string;
  category: string;
  ats: 'GREENHOUSE' | 'LEVER' | 'ASHBY' | 'SMARTRECRUITERS';
  token: string;
  officialDomain: string;
  careersUrl: string;
  totalJobs: number;
  indianJobs: number;
  fresherJobs: number;
  fresherTitles: string[];
  indianTitles: string[];
}

async function probeGreenhouse(token: string): Promise<{ total: number; jobs: any[] } | null> {
  try {
    const url = `https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data: any = await res.json();
      if (Array.isArray(data?.jobs)) {
        return { total: data.jobs.length, jobs: data.jobs };
      }
    }
  } catch {}
  return null;
}

async function probeLever(token: string): Promise<{ total: number; jobs: any[] } | null> {
  try {
    const url = `https://api.lever.co/v0/postings/${token}?mode=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data: any = await res.json();
      if (Array.isArray(data)) {
        return { total: data.length, jobs: data };
      }
    }
  } catch {}
  return null;
}

async function probeAshby(token: string): Promise<{ total: number; jobs: any[] } | null> {
  try {
    const url = `https://api.ashbyhq.com/posting-api/job-board/${token}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data: any = await res.json();
      if (Array.isArray(data?.jobs)) {
        return { total: data.jobs.length, jobs: data.jobs };
      }
    }
  } catch {}
  return null;
}

async function probeSmartRecruiters(companyId: string): Promise<{ total: number; jobs: any[] } | null> {
  try {
    const url = `https://api.smartrecruiters.com/v1/companies/${companyId}/postings`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data: any = await res.json();
      if (Array.isArray(data?.content)) {
        return { total: data.totalFound || data.content.length, jobs: data.content };
      }
    }
  } catch {}
  return null;
}

async function probeOneCandidate(candidate: ProbeTarget): Promise<ProbeResult | null> {
  // 1. Greenhouse
  if (candidate.tokens.greenhouse) {
    for (const token of candidate.tokens.greenhouse) {
      const gh = await probeGreenhouse(token);
      if (gh && gh.total > 0) {
        const inJobs: any[] = [];
        const fresherTitles: string[] = [];
        const inTitles: string[] = [];

        for (const j of gh.jobs) {
          const locName = j.location?.name || '';
          const title = j.title || '';
          const desc = j.content || '';
          if (isIndian(locName) || isIndian(title)) {
            inJobs.push(j);
            inTitles.push(`${title} (${locName})`);
            const parsed = parseExperienceRequirements(title, desc, '');
            if (parsed.classification === 'FRESHER_COMPATIBLE' || parsed.classification === 'BOTH') {
              fresherTitles.push(`${title} [${parsed.classification}]`);
            }
          }
        }

        return {
          company: candidate.name,
          category: candidate.category,
          ats: 'GREENHOUSE',
          token,
          officialDomain: candidate.officialDomain,
          careersUrl: `https://job-boards.greenhouse.io/${token}`,
          totalJobs: gh.total,
          indianJobs: inJobs.length,
          fresherJobs: fresherTitles.length,
          fresherTitles,
          indianTitles: inTitles.slice(0, 5),
        };
      }
    }
  }

  // 2. Lever
  if (candidate.tokens.lever) {
    for (const token of candidate.tokens.lever) {
      const lev = await probeLever(token);
      if (lev && lev.total > 0) {
        const inJobs: any[] = [];
        const fresherTitles: string[] = [];
        const inTitles: string[] = [];

        for (const j of lev.jobs) {
          const locName = j.categories?.location || '';
          const title = j.text || '';
          const desc = j.descriptionPlain || j.description || '';
          if (isIndian(locName) || isIndian(title)) {
            inJobs.push(j);
            inTitles.push(`${title} (${locName})`);
            const parsed = parseExperienceRequirements(title, desc, '');
            if (parsed.classification === 'FRESHER_COMPATIBLE' || parsed.classification === 'BOTH') {
              fresherTitles.push(`${title} [${parsed.classification}]`);
            }
          }
        }

        return {
          company: candidate.name,
          category: candidate.category,
          ats: 'LEVER',
          token,
          officialDomain: candidate.officialDomain,
          careersUrl: `https://jobs.lever.co/${token}`,
          totalJobs: lev.total,
          indianJobs: inJobs.length,
          fresherJobs: fresherTitles.length,
          fresherTitles,
          indianTitles: inTitles.slice(0, 5),
        };
      }
    }
  }

  // 3. Ashby
  if (candidate.tokens.ashby) {
    for (const token of candidate.tokens.ashby) {
      const ash = await probeAshby(token);
      if (ash && ash.total > 0) {
        const inJobs: any[] = [];
        const fresherTitles: string[] = [];
        const inTitles: string[] = [];

        for (const j of ash.jobs) {
          const locName = j.location || (j.secondaryLocations?.map((l: any) => l.location).join(', ')) || '';
          const title = j.title || '';
          const desc = j.descriptionHtml || j.descriptionPlain || '';
          if (isIndian(locName) || isIndian(title)) {
            inJobs.push(j);
            inTitles.push(`${title} (${locName})`);
            const parsed = parseExperienceRequirements(title, desc, '');
            if (parsed.classification === 'FRESHER_COMPATIBLE' || parsed.classification === 'BOTH') {
              fresherTitles.push(`${title} [${parsed.classification}]`);
            }
          }
        }

        return {
          company: candidate.name,
          category: candidate.category,
          ats: 'ASHBY',
          token,
          officialDomain: candidate.officialDomain,
          careersUrl: `https://jobs.ashbyhq.com/${token}`,
          totalJobs: ash.total,
          indianJobs: inJobs.length,
          fresherJobs: fresherTitles.length,
          fresherTitles,
          indianTitles: inTitles.slice(0, 5),
        };
      }
    }
  }

  // 4. SmartRecruiters
  if (candidate.tokens.smartrecruiters) {
    for (const cid of candidate.tokens.smartrecruiters) {
      const sr = await probeSmartRecruiters(cid);
      if (sr && sr.total > 0) {
        const inJobs: any[] = [];
        const fresherTitles: string[] = [];
        const inTitles: string[] = [];

        for (const j of sr.jobs) {
          const locName = `${j.location?.city || ''}, ${j.location?.region || ''}, ${j.location?.country || ''}`;
          const title = j.name || '';
          if (isIndian(locName) || isIndian(title)) {
            inJobs.push(j);
            inTitles.push(`${title} (${locName})`);
            const parsed = parseExperienceRequirements(title, '', '');
            if (parsed.classification === 'FRESHER_COMPATIBLE' || parsed.classification === 'BOTH') {
              fresherTitles.push(`${title} [${parsed.classification}]`);
            }
          }
        }

        return {
          company: candidate.name,
          category: candidate.category,
          ats: 'SMARTRECRUITERS',
          token: cid,
          officialDomain: candidate.officialDomain,
          careersUrl: `https://careers.smartrecruiters.com/${cid}`,
          totalJobs: sr.total,
          indianJobs: inJobs.length,
          fresherJobs: fresherTitles.length,
          fresherTitles,
          indianTitles: inTitles.slice(0, 5),
        };
      }
    }
  }

  return null;
}

async function runProbe() {
  console.log(`=== CONCURRENT PROBING ${CANDIDATES.length} TARGETS ===`);
  const existingNames = new Set(SOURCE_CATALOG.map(s => s.companyName.toLowerCase()));

  const probePromises = CANDIDATES.map(c => probeOneCandidate(c));
  const probeOutputs = await Promise.all(probePromises);
  const results = probeOutputs.filter((r): r is ProbeResult => r !== null);

  results.sort((a, b) => b.fresherJobs - a.fresherJobs || b.indianJobs - a.indianJobs || b.totalJobs - a.totalJobs);

  console.log('-----------------------------------------------------------------------------------------------------------------------------');
  console.log(
    'Company'.padEnd(20) +
    'ATS'.padEnd(16) +
    'Token'.padEnd(22) +
    'Total'.padStart(7) +
    'India'.padStart(7) +
    'Fresher'.padStart(9) +
    ' In Catalog?'.padEnd(15)
  );
  console.log('-----------------------------------------------------------------------------------------------------------------------------');

  for (const r of results) {
    const inCatalog = existingNames.has(r.company.toLowerCase()) ? 'YES' : 'NO';
    console.log(
      r.company.padEnd(20) +
      r.ats.padEnd(16) +
      r.token.padEnd(22) +
      String(r.totalJobs).padStart(7) +
      String(r.indianJobs).padStart(7) +
      String(r.fresherJobs).padStart(9) +
      (' ' + inCatalog).padEnd(15)
    );
    if (r.fresherJobs > 0) {
      console.log(`   -> Fresher Titles: ${r.fresherTitles.slice(0, 3).join('; ')}`);
    }
  }

  console.log('\n--- CANDIDATE COMPANIES NOT CURRENTLY IN CATALOG WITH INDIAN JOBS ---');
  const newCandidates = results.filter(r => !existingNames.has(r.company.toLowerCase()) && r.indianJobs > 0);
  for (const r of newCandidates) {
    console.log(`- ${r.company} (${r.ats}: ${r.token}) -> ${r.indianJobs} Indian jobs, ${r.fresherJobs} fresher jobs [Domain: ${r.officialDomain}]`);
  }
}

runProbe().catch(console.error);
