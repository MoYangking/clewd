/*
* https://rentry.org/teralomaniac_clewd
* https://github.com/teralomaniac/clewd
*/
'use strict';

const {createServer: Server, IncomingMessage, ServerResponse} = require('node:http'), {createHash: Hash, randomUUID, randomInt, randomBytes} = require('node:crypto'), {TransformStream, ReadableStream} = require('node:stream/web'), {Readable, Writable} = require('node:stream'), {Blob} = require('node:buffer'), {existsSync: exists, writeFileSync: write, createWriteStream} = require('node:fs'), {join: joinP} = require('node:path'), {ClewdSuperfetch: Superfetch, SuperfetchAvailable, SuperfetchFoldersMk, SuperfetchFoldersRm} = require('./lib/clewd-superfetch'), {AI, fileName, genericFixes, bytesToSize, setTitle, checkResErr, Replacements, Main} = require('./lib/clewd-utils'), ClewdStream = require('./lib/clewd-stream');

/******************************************************* */
let currentIndex, Firstlogin = true, changeflag = 0, changing, changetime = 0, totaltime, uuidOrgArray = [], model, cookieModel, tokens, apiKey, timestamp, regexLog, isPro, modelList = [];

const url = require('url');
const asyncPool = async (poolLimit, array, iteratorFn) => {
    const ret = [], executing = [];
    for (const item of array) {
        const p = Promise.resolve().then(() => iteratorFn(item));
        ret.push(p);
        if (poolLimit <= array.length) {
            const e = p.then(() => executing.splice(executing.indexOf(e), 1));
            executing.push(e);
            if (executing.length >= poolLimit) await Promise.race(executing);
        }
    }
    return Promise.all(ret);
}, convertToType = value => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (/^\d+$/.test(value)) return parseInt(value);
    return value;
}, CookieChanger = (resetTimer = true, cleanup = false) => {
    if (Config.CookieArray?.length <= 1) {
        return changing = false;
    } else {
        changeflag = 0, changing = true;
        if(!cleanup) {
            currentIndex = (currentIndex + 1) % Config.CookieArray.length;
            console.log(`Changing Cookie...\n`);
        }
        setTimeout(() => {
            onListen();
            resetTimer && (timestamp = Date.now());
        }, !Config.rProxy || Config.rProxy === AI.end() ? 15000 + timestamp - Date.now() : 0);
    }
}, CookieCleaner = (flag, percentage) => {
    Config.WastedCookie.push(flag + '@' + Config.CookieArray[currentIndex].split('@').toReversed()[0]);
    Config.CookieArray.splice(currentIndex, 1), Config.Cookie = '';
    Config.Cookiecounter < 0 && console.log(`[progress]: [32m${percentage.toFixed(2)}%[0m\n[length]: [33m${Config.CookieArray.length}[0m\n`);
    console.log(`Cleaning Cookie...\n`);
    writeSettings(Config);
    return CookieChanger(true, true);
}, padtxt = content => {
    const {countTokens} = require('@anthropic-ai/tokenizer');
    tokens = countTokens(content);
    const padtxt = String(Config.Settings.padtxt).split(',').reverse(), maxtokens = parseInt(padtxt[0]), extralimit = parseInt(padtxt[1]) || 1000, minlimit = parseInt(padtxt[2]);
    const placeholder = (tokens > maxtokens - extralimit && minlimit ? Config.placeholder_byte : Config.placeholder_token) || randomBytes(randomInt(5, 15)).toString('hex');
    const placeholdertokens = countTokens(placeholder.trim());
    for (let match; match = content.match(/<\|padtxt.*?(\d+)t.*?\|>/); content = content.replace(match[0], placeholder.repeat(parseInt(match[1]) / placeholdertokens))) tokens += parseInt(match[1]);
    if(/<\|padtxt off.*?\|>/.test(content)) return content.replace(/\s*<\|padtxt.*?\|>\s*/g, '\n\n');
    const padding = placeholder.repeat(Math.min(maxtokens, (tokens <= maxtokens - extralimit ? maxtokens - tokens : minlimit ? minlimit : extralimit)) / placeholdertokens);
    content = /<\|padtxt.*?\|>/.test(content) ? content.replace(/<\|padtxt.*?\|>/, padding).replace(/\s*<\|padtxt.*?\|>\s*/g, '\n\n') : !apiKey ? padding + '\n\n\n' + content.trim() : content;
    return content;
}, xmlPlot_merge = (content, mergeTag, nonsys) => {
    if (/(\n\n|^\s*)xmlPlot:\s*/.test(content)) {
        content = (nonsys ? content : content.replace(/(\n\n|^\s*)(?<!\n\n(Human|Assistant):.*?)xmlPlot:\s*/gs, '$1')).replace(/(\n\n|^\s*)xmlPlot: */g, mergeTag.system && mergeTag.human && mergeTag.all ? '\n\nHuman: ' : '$1' );
    }
    mergeTag.all && mergeTag.human && (content = content.replace(/(?:\n\n|^\s*)Human:(.*?(?:\n\nAssistant:|$))/gs, function(match, p1) {return '\n\nHuman:' + p1.replace(/\n\nHuman:\s*/g, '\n\n')}));
    mergeTag.all && mergeTag.assistant && (content = content.replace(/\n\nAssistant:(.*?(?:\n\nHuman:|$))/gs, function(match, p1) {return '\n\nAssistant:' + p1.replace(/\n\nAssistant:\s*/g, '\n\n')}));
    return content;
}, xmlPlot_regex = (content, order) => {
    let matches = content.match(new RegExp(`<regex(?: +order *= *${order})${order === 2 ? '?' : ''}> *"(/?)(.*)\\1(.*?)" *: *"(.*?)" *</regex>`, 'gm'));
    matches && matches.forEach(match => {
        try {
            const reg = /<regex(?: +order *= *\d)?> *"(\/?)(.*)\1(.*?)" *: *"(.*?)" *<\/regex>/.exec(match);
            regexLog += match + '\n';
            content = content.replace(new RegExp(reg[2], reg[3]), JSON.parse(`"${reg[4].replace(/\\?"/g, '\\"')}"`));
        } catch (err) {
            console.log(`[33mRegex error: [0m` + match + '\n' + err);
        }
    });
    return content;
}, xmlPlot = (content, nonsys = false) => {
    regexLog = '';
    //一次正则
    content = xmlPlot_regex(content, 1);
    //一次role合并
    const mergeTag = {
        all: !content.includes('<|Merge Disable|>'),
        system: !content.includes('<|Merge System Disable|>'),
        human: !content.includes('<|Merge Human Disable|>'),
        assistant: !content.includes('<|Merge Assistant Disable|>')
    };
    content = xmlPlot_merge(content, mergeTag, nonsys);
    //自定义插入
    let splitContent = content.split(/\n\n(?=Assistant:|Human:)/g), match;
    while ((match = /<@(\d+)>(.*?)<\/@\1>/gs.exec(content)) !== null) {
        let index = splitContent.length - parseInt(match[1]) - 1;
        index >= 0 && (splitContent[index] += '\n\n' + match[2]);
        content = content.replace(match[0], '');
    }
    content = splitContent.join('\n\n').replace(/<@(\d+)>.*?<\/@\1>/gs, '');
    //二次正则
    content = xmlPlot_regex(content, 2);
    //二次role合并
    content = xmlPlot_merge(content, mergeTag, nonsys);
    //Plain Prompt
    let segcontentHuman = content.split('\n\nHuman:');
    let segcontentlastIndex = segcontentHuman.length - 1;
    if (!apiKey && segcontentlastIndex >= 2 && segcontentHuman[segcontentlastIndex].includes('<|Plain Prompt Enable|>') && !content.includes('\n\nPlainPrompt:')) {
        content = segcontentHuman.slice(0, segcontentlastIndex).join('\n\nHuman:') + '\n\nPlainPrompt:' + segcontentHuman.slice(segcontentlastIndex).join('\n\nHuman:').replace(/\n\nHuman: *PlainPrompt:/, '\n\nPlainPrompt:');
    }
    //三次正则
    content = xmlPlot_regex(content, 3);
    //消除空XML tags、两端空白符和多余的\n
    content = content.replace(/<regex( +order *= *\d)?>.*?<\/regex>/gm, '')
        .replace(/\r\n|\r/gm, '\n')
        .replace(/\s*<\|curtail\|>\s*/g, '\n')
        .replace(/\s*<\|join\|>\s*/g, '')
        .replace(/\s*<\|space\|>\s*/g, ' ')
        .replace(/\s*\n\n(H(uman)?|A(ssistant)?): +/g, '\n\n$1: ')
        .replace(/<\|(\\.*?)\|>/g, function(match, p1) {
            try {
                return JSON.parse(`"${p1.replace(/\\?"/g, '\\"')}"`);
            } catch { return match }
        });
    //确保格式正确
    if (apiKey) {
        content = content.replace(/(\n\nHuman:(?!.*?\n\nAssistant:).*?|(?<!\n\nAssistant:.*?))$/s, '$&\n\nAssistant:').replace(/\s*<\|noAssistant\|>\s*(.*?)(?:\n\nAssistant:\s*)?$/s, '\n\n$1');
        content.includes('<|reverseHA|>') && (content = content.replace(/\s*<\|reverseHA\|>\s*/g, '\n\n').replace(/Assistant|Human/g, function(match) {return match === 'Human' ? 'Assistant' : 'Human'}).replace(/\n(A|H): /g, function(match, p1) {return p1 === 'A' ? '\nH: ' : '\nA: '}));
        return content.replace(Config.Settings.padtxt ? /\s*<\|(?!padtxt).*?\|>\s*/g : /\s*<\|.*?\|>\s*/g, '\n\n').trim().replace(/^.+:/, '\n\n$&').replace(/(?<=\n)\n(?=\n)/g, '');
    } else {
        return content.replace(Config.Settings.padtxt ? /\s*<\|(?!padtxt).*?\|>\s*/g : /\s*<\|.*?\|>\s*/g, '\n\n').trim().replace(/^Human: *|\n\nAssistant: *$/g, '').replace(/(?<=\n)\n(?=\n)/g, '');
    }
}, waitForChange = () =>  {
    return new Promise(resolve => {
      const interval = setInterval(() => {
        if (!changing) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
    });
};
/******************************************************* */

let ChangedSettings, UnknownSettings, Logger;

const ConfigPath = joinP(__dirname, './config.js'), LogPath = joinP(__dirname, './log.txt'), Conversation = {
    char: null,
    uuid: null,
    depth: 0
}, cookies = {};

let uuidOrg, curPrompt = {}, prevPrompt = {}, prevMessages = [], prevImpersonated = false, Config = {
    Cookie: '',
    CookieArray: [],
    WastedCookie: [],
    unknownModels: [],
    Cookiecounter: 3,
    CookieIndex: 0,
    ProxyPassword: '',
    Ip: (process.env.Cookie || process.env.CookieArray) ? '0.0.0.0' : '127.0.0.1',
    Port: process.env.PORT || 8444,
    localtunnel: false,
    BufferSize: 1,
    SystemInterval: 3,
    rProxy: '',
    api_rProxy: '',
    placeholder_token: '',
    placeholder_byte: '',
    PromptExperimentFirst: '',
    PromptExperimentNext: '',
    PersonalityFormat: '{{char}}\'s personality: {{personality}}',
    ScenarioFormat: 'Dialogue scenario: {{scenario}}',
    Settings: {
        RenewAlways: true,
        RetryRegenerate: false,
        PromptExperiments: true,
        SystemExperiments: true,
        PreventImperson: true,
        AllSamples: false,
        NoSamples: false,
        StripAssistant: false,
        StripHuman: false,
        PassParams: true,
        ClearFlags: true,
        PreserveChats: false,
        LogMessages: true,
        FullColon: true,
        padtxt: "1000,1000,15000",
        xmlPlot: true,
        SkipRestricted: false,
        Artifacts: false,
        Superfetch: true
    }
};

ServerResponse.prototype.json = async function(body, statusCode = 200, headers) {
    body = body instanceof Promise ? await body : body;
    this.headersSent || this.writeHead(statusCode, {
        'Content-Type': 'application/json',
        ...headers && headers
    });
    this.end('object' == typeof body ? JSON.stringify(body) : body);
    return this;
};

Array.prototype.sample = function() {
    return this[Math.floor(Math.random() * this.length)];
};

const updateParams = res => {
    updateCookies(res);
}, updateCookies = res => {
    let cookieNew = '';
    res instanceof Response ? cookieNew = res.headers?.get('set-cookie') : res?.superfetch ? cookieNew = res.headers?.['set-cookie'] : 'string' == typeof res && (cookieNew = res.split('\n').join(''));
    if (!cookieNew) {
        return;
    }
    let cookieArr = cookieNew.split(/;\s?/gi).filter((prop => false === /^(path|expires|domain|HttpOnly|Secure|SameSite)[=;]*/i.test(prop)));
    for (const cookie of cookieArr) {
        const divide = cookie.split(/^(.*?)=\s*(.*)/), cookieName = divide[1], cookieVal = divide[2];
        cookies[cookieName] = cookieVal;
    }
}, getCookies = () => {
    const cookieNames = Object.keys(cookies);
    return cookieNames.map(((name, idx) => `${name}=${cookies[name]}${idx === cookieNames.length - 1 ? '' : ';'}`)).join(' ').replace(/(\s+)$/gi, '');
}, deleteChat = async uuid => {
    if (!uuid) {
        return;
    }
    if (uuid === Conversation.uuid) {
        Conversation.uuid = null;
        Conversation.depth = 0;
    }
    if (Config.Settings.PreserveChats) {
        return;
    }
    const res = await (Config.Settings.Superfetch ? Superfetch : fetch)(`${Config.rProxy || AI.end()}/api/organizations/${uuidOrg}/chat_conversations/${uuid}`, {
        headers: {
            ...AI.hdr(),
            Cookie: getCookies()
        },
        method: 'DELETE'
    });
    updateParams(res);
}, onListen = async () => {
/***************************** */
    if (Firstlogin) {
        Firstlogin = false, timestamp = Date.now(), totaltime = Config.CookieArray.length;
        console.log(`[2m${Main}[0m\n[33mhttp://${Config.Ip}:${Config.Port}/v1[0m\n\n${Object.keys(Config.Settings).map((setting => UnknownSettings?.includes(setting) ? `??? [31m${setting}: ${Config.Settings[setting]}[0m` : `[1m${setting}:[0m ${ChangedSettings?.includes(setting) ? '[33m' : '[36m'}${Config.Settings[setting]}[0m`)).sort().join('\n')}\n`); //↓
        if (Config.Settings.Superfetch) {
            SuperfetchAvailable(true);
            SuperfetchFoldersMk();
        }
        if (Config.localtunnel) {
            const localtunnel = require('localtunnel');
            localtunnel({ port: Config.Port }).then((tunnel) => {
                console.log(`\nTunnel URL for outer websites: ${tunnel.url}/v1\n`);
            })
        }
    }
    if (Config.CookieArray?.length > 0) {
        const cookieInfo = /(?:(claude[-_][a-z0-9-_]*?)@)?(?:sessionKey=)?(sk-ant-sid01-[\w-]{86}-[\w-]{6}AA)/.exec(Config.CookieArray[currentIndex]);
        cookieInfo?.[2] && (Config.Cookie = 'sessionKey=' + cookieInfo[2]);
        changetime++;
        if (model && cookieInfo?.[1] && !/claude[\w]*?_pro/.test(cookieInfo?.[1]) && cookieInfo?.[1] != model) return CookieChanger(false);
    }
    let percentage = ((changetime + Math.max(Config.CookieIndex - 1, 0)) / totaltime) * 100
    if (Config.Cookiecounter < 0 && percentage > 100) {
        console.log(`\n※※※Cookie cleanup completed※※※\n\n`);
        return process.exit();
    }
    try {
/***************************** */
    if ('SET YOUR COOKIE HERE' === Config.Cookie || Config.Cookie?.length < 1) {
        return changing = false, console.log(`[33mNo cookie available, enter apiKey-only mode.[0m\n`); //throw Error('Set your cookie inside config.js');
    }
    updateCookies(Config.Cookie);
/**************************** */
    const bootstrapRes = await (Config.Settings.Superfetch ? Superfetch : fetch)((Config.rProxy || AI.end()) + `/api/bootstrap`, {
        method: 'GET',
        headers: {
            ...AI.hdr(),
            Cookie: getCookies()
        }
    });
    await checkResErr(bootstrapRes);
    const bootstrap = await bootstrapRes.json();
    if (bootstrap.account === null) {
        console.log(`[35mNull![0m`);
        return CookieCleaner('Null', percentage);
    }
    const bootAccInfo = bootstrap.account.memberships.find(item => item.organization.capabilities.includes('chat')).organization;
    cookieModel = bootstrap.statsig.values.layer_configs["HPOHwBLNLQLxkj5Yn4bfSkgCQnBX28kPR7h/BNKdVLw="]?.value?.console_default_model_override?.model || bootstrap.statsig.values.dynamic_configs["6zA9wvTedwkzjLxWy9PVe7yydI00XDQ6L5Fejjq/2o8="]?.value?.model;
    isPro = bootAccInfo.capabilities.includes('claude_pro') && 'claude_pro' || bootAccInfo.capabilities.includes('raven') && 'claude_team_pro';
    const unknown = cookieModel && !(AI.mdl().includes(cookieModel) || Config.unknownModels.includes(cookieModel));
    if (Config.CookieArray?.length > 0 && (isPro || cookieModel) != Config.CookieArray[currentIndex].split('@')[0] || unknown) {
        Config.CookieArray[currentIndex] = (isPro || cookieModel) + '@' + Config.Cookie;
        unknown && Config.unknownModels.push(cookieModel);
        writeSettings(Config);
    }
    if (!isPro && model && model != cookieModel) return CookieChanger();
    console.log(Config.CookieArray?.length > 0 ? `(index: [36m${currentIndex + 1 || Config.CookieArray.length}[0m) Logged in %o` : 'Logged in %o', { //console.log('Logged in %o', { ↓
        name: bootAccInfo.name?.split('@')?.[0],
        mail: bootstrap.account.email_address, //
        cookieModel, //
        capabilities: bootAccInfo.capabilities
    }); //↓
    if (uuidOrgArray.includes(bootAccInfo.uuid) && percentage <= 100 && Config.CookieArray?.length > 0 || bootAccInfo.api_disabled_reason && !bootAccInfo.api_disabled_until || !bootstrap.account.completed_verification_at) {
        const flag = bootAccInfo.api_disabled_reason ? 'Disabled' : !bootstrap.account.completed_verification_at ? 'Unverified' : 'Overlap';
        console.log(`[31m${flag}![0m`);
        return CookieCleaner(flag, percentage);
    } else uuidOrgArray.push(bootAccInfo.uuid);
    if (Config.Cookiecounter < 0) {
        console.log(`[progress]: [32m${percentage.toFixed(2)}%[0m\n[length]: [33m${Config.CookieArray.length}[0m\n`);
        return CookieChanger();
    }
/**************************** */
    const accRes = await (Config.Settings.Superfetch ? Superfetch : fetch)((Config.rProxy || AI.end()) + '/api/organizations', {
        method: 'GET',
        headers: {
            ...AI.hdr(),
            Cookie: getCookies()
        }
    });
    await checkResErr(accRes);
    const accInfo = (await accRes.json())?.find(item => item.capabilities.includes('chat')); //const accInfo = (await accRes.json())?.[0];\nif (!accInfo || accInfo.error) {\n    throw Error(`Couldn't get account info: "${accInfo?.error?.message || accRes.statusText}"`);\n}\nif (!accInfo?.uuid) {\n    throw Error('Invalid account id');\n}
    setTitle('ok');
    updateParams(accRes);
    uuidOrg = accInfo?.uuid;
    if (accInfo?.active_flags.length > 0) {
        let banned = false; //
        const now = new Date, formattedFlags = accInfo.active_flags.map((flag => {
            const days = ((new Date(flag.expires_at).getTime() - now.getTime()) / 864e5).toFixed(2);
            'consumer_banned' === flag.type && (banned = true); //
            return {
                type: flag.type,
                remaining_days: days
            };
        }));
        console.warn(`${banned ? '[31m' : '[35m'}Your account has warnings[0m %o`, formattedFlags); //console.warn('[31mYour account has warnings[0m %o', formattedFlags);
        await Promise.all(accInfo.active_flags.map((flag => (async type => {
            if (!Config.Settings.ClearFlags) {
                return;
            }
            if ('consumer_restricted_mode' === type || 'consumer_banned' === type) { //if ('consumer_restricted_mode' === type) {
                return;
            }
            const req = await (Config.Settings.Superfetch ? Superfetch : fetch)(`${Config.rProxy || AI.end()}/api/organizations/${uuidOrg}/flags/${type}/dismiss`, {
                headers: {
                    ...AI.hdr(),
                    Cookie: getCookies()
                },
                method: 'POST'
            });
            updateParams(req);
            const json = await req.json();
            console.log(`${type}: ${json.error ? json.error.message || json.error.type || json.detail : 'OK'}`);
        })(flag.type))));
        console.log(`${banned ? '[31mBanned' : '[35mRestricted'}![0m`); //
        if (banned) return CookieCleaner('Banned') //
        else if (Config.Settings.SkipRestricted) return CookieChanger(); //
    }
    if (bootstrap.account.settings.preview_feature_uses_artifacts != Config.Settings.Artifacts) {
        const settingsRes = await (Config.Settings.Superfetch ? Superfetch : fetch)((Config.rProxy || AI.end()) + `/api/account`, {
            method: 'PUT',
            headers: {
                ...AI.hdr(),
                Cookie: getCookies()
            },
            body: JSON.stringify({ settings: Object.assign(bootstrap.account.settings, { preview_feature_uses_artifacts: Config.Settings.Artifacts }) }),
        });
        await checkResErr(settingsRes);
        updateParams(settingsRes);
    }
    changing = false;
    const convRes = await (Config.Settings.Superfetch ? Superfetch : fetch)(`${Config.rProxy || AI.end()}/api/organizations/${accInfo.uuid}/chat_conversations`, { //const convRes = await fetch(`${Config.rProxy || AI.end()}/api/organizations/${uuidOrg}/chat_conversations`, {
        method: 'GET',
        headers: {
            ...AI.hdr(),
            Cookie: getCookies()
        }
    }), conversations = await convRes.json();
    updateParams(convRes);
    conversations.length > 0 && await asyncPool(10, conversations, async (conv) => await deleteChat(conv.uuid)); //await Promise.all(conversations.map((conv => deleteChat(conv.uuid))));
/***************************** */
    } catch (err) {
        if (err.message === 'Invalid authorization') {
            console.log(`[31mInvalid![0m`);
            return CookieCleaner('Invalid', percentage);
        }
        // 处理403权限错误
        if (err.status === 403 && err.isCookieError && Config.CookieArray?.length > 1) {
            console.log(`[31mCookie权限错误，正在自动切换下一个Cookie...[0m`);
            return CookieCleaner('Permission', percentage);
        }
        console.error('[33mClewd:[0m\n%o', err);
        CookieChanger();
    }
/***************************** */
}, writeSettings = async (config, firstRun = false) => {
    if (process.env.Cookie || process.env.CookieArray) return; //
    write(ConfigPath, `/*\n* https://rentry.org/teralomaniac_clewd\n* https://github.com/teralomaniac/clewd\n*/\n\n// SET YOUR COOKIE BELOW\n\nmodule.exports = ${JSON.stringify(config, null, 4)}\n\n/*\n BufferSize\n * How many characters will be buffered before the AI types once\n * lower = less chance of \`PreventImperson\` working properly\n\n ---\n\n SystemInterval\n * How many messages until \`SystemExperiments alternates\`\n\n ---\n\n Other settings\n * https://gitgud.io/ahsk/clewd/#defaults\n * and\n * https://gitgud.io/ahsk/clewd/-/blob/master/CHANGELOG.md\n */`.trim().replace(/((?<!\r)\n|\r(?!\n))/g, '\r\n'));
    if (firstRun) {
        console.warn('[33mconfig file created!\nedit[0m [1mconfig.js[0m [33mto set your settings and restart the program[0m');
        process.exit(0);
    }
}, Proxy = Server((async (req, res) => {
    if ('OPTIONS' === req.method) {
        return ((req, res) => {
            res.writeHead(200, {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Authorization, Content-Type',
                'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
            }).end();
        })(0, res);
    }
    const URL = url.parse(req.url.replace(/\/v1(\?.*)\$(\/.*)$/, '/v1$2$1'), true);
    const api_rProxy = URL.query?.api_rProxy || Config.api_rProxy;
    req.url = URL.pathname;
    switch (req.url) {
      case '/v1/models':
/***************************** */
        (async (req, res) => {
            let models;
            if (/oaiKey:/.test(req.headers.authorization)) {
                try {
                    const modelsRes = await fetch(api_rProxy.replace(/(\/v1)?\/? *$/, '') + '/v1/models', {
                        method: 'GET',
                        headers: { authorization: req.headers.authorization.match(/(?<=oaiKey:).*/)?.[0].split(',')[0].trim() }
                    });
                    models = await modelsRes.json();
                } catch(err) {}
            }
            res.json({
                data: [
                    ...AI.mdl().concat(Config.unknownModels).map((name => ({ id: name })))
                ].concat(models?.data).reduce((acc, current, index) => {
                    index === 0 && modelList.splice(0);
                    if (current?.id && acc.every(model => model.id != current.id)) {
                        acc.push(current);
                        modelList.push(current.id);
                    }
                    return acc;
                }, [])
            });
        })(req, res); //res.json({\n    data: AI.mdl().map((name => ({\n        id: name\n    })))\n});
/***************************** */
        break;

      case '/v1/chat/completions':
        ((req, res) => {
            setTitle('recv...');
            let fetchAPI;
            const abortControl = new AbortController, {signal} = abortControl;
            res.socket.on('close', (async () => {
                abortControl.signal.aborted || abortControl.abort();
            }));
            const buffer = [];
            req.on('data', (chunk => {
                buffer.push(chunk);
            }));
            req.on('end', (async () => {
                let clewdStream, titleTimer, samePrompt = false, shouldRenew = true, retryRegen = false, exceeded_limit = false, nochange = false; //let clewdStream, titleTimer, samePrompt = false, shouldRenew = true, retryRegen = false;
                try {
                    const body = JSON.parse(Buffer.concat(buffer).toString());
                    let {temperature} = body;
                    temperature = typeof temperature === 'number' ? Math.max(.1, Math.min(1, temperature)) : undefined; //temperature = Math.max(.1, Math.min(1, temperature));
                    let {messages} = body;
/************************* */
                    const thirdKey = req.headers.authorization?.match(/(?<=(3rd|oai)Key:).*/), oaiAPI = /oaiKey:/.test(req.headers.authorization), forceModel = /--force/.test(body.model);
                    apiKey = thirdKey?.[0].split(',').map(item => item.trim()) || req.headers.authorization?.match(/sk-ant-api\d\d-[\w-]{86}-[\w-]{6}AA/g);
                    model = apiKey || forceModel || isPro ? body.model.replace(/--force/, '').trim() : cookieModel;
                    let max_tokens_to_sample = body.max_tokens, stop_sequences = body.stop, top_p = typeof body.top_p === 'number' ? body.top_p : undefined, top_k = typeof body.top_k === 'number' ? body.top_k : undefined;
                    if (!apiKey && (Config.ProxyPassword != '' && req.headers.authorization != 'Bearer ' + Config.ProxyPassword || !uuidOrg)) {
                        throw Error(uuidOrg ? 'ProxyPassword Wrong' : 'No cookie available or apiKey format wrong');
                    } else if (!changing && !apiKey && (!isPro && model != cookieModel)) CookieChanger();
                    await waitForChange();
/************************* */
                    if (messages?.length < 1) {
                        throw Error('Select OpenAI as completion source');
                    }
                    if (!body.stream && 1 === messages.length && JSON.stringify(messages.sort() || []) === JSON.stringify([ {
                        role: 'user',
                        content: 'Hi'
                    } ].sort())) {
                        return res.json({
                            choices: [ {
                                message: {
                                    content: Main
                                }
                            } ]
                        });
                    }
                    res.setHeader('Access-Control-Allow-Origin', '*');
                    body.stream && res.setHeader('Content-Type', 'text/event-stream');
                    if (!body.stream && messages?.[0]?.content?.startsWith('From the list below, choose a word that best represents a character\'s outfit description, action, or emotion in their dialogue')) {
                        return res.json({
                            choices: [ {
                                message: {
                                    content: 'neutral'
                                }
                            } ]
                        });
                    }
                    if (Config.Settings.AllSamples && Config.Settings.NoSamples) {
                        console.log('[33mhaving[0m [1mAllSamples[0m and [1mNoSamples[0m both set to true is not supported');
                        throw Error('Only one can be used at the same time: AllSamples/NoSamples');
                    }
                    //const model = body.model;//if (model === AI.mdl()[0]) {//    return;//}
                    if (!modelList.includes(model) && !/claude-.*/.test(model) && !forceModel) {
                        throw Error('Invalid model selected: ' + model);
                    }
                    curPrompt = {
                        firstUser: messages.find((message => 'user' === message.role)),
                        firstSystem: messages.find((message => 'system' === message.role)),
                        firstAssistant: messages.find((message => 'assistant' === message.role)),
                        lastUser: messages.findLast((message => 'user' === message.role)),
                        lastSystem: messages.findLast((message => 'system' === message.role && '[Start a new chat]' !== message.content)),
                        lastAssistant: messages.findLast((message => 'assistant' === message.role))
                    };
                    prevPrompt = {
                        ...prevMessages.length > 0 && {
                            firstUser: prevMessages.find((message => 'user' === message.role)),
                            firstSystem: prevMessages.find((message => 'system' === message.role)),
                            firstAssistant: prevMessages.find((message => 'assistant' === message.role)),
                            lastUser: prevMessages.findLast((message => 'user' === message.role)),
                            lastSystem: prevMessages.find((message => 'system' === message.role && '[Start a new chat]' !== message.content)),
                            lastAssistant: prevMessages.findLast((message => 'assistant' === message.role))
                        }
                    };
                    samePrompt = JSON.stringify(messages.filter((message => 'system' !== message.role)).sort()) === JSON.stringify(prevMessages.filter((message => 'system' !== message.role)).sort());
                    const sameCharDiffChat = !samePrompt && curPrompt.firstSystem?.content === prevPrompt.firstSystem?.content && curPrompt.firstUser?.content !== prevPrompt.firstUser?.content;
                    shouldRenew = Config.Settings.RenewAlways || !Conversation.uuid || prevImpersonated || !Config.Settings.RenewAlways && samePrompt || sameCharDiffChat;
                    retryRegen = Config.Settings.RetryRegenerate && samePrompt && null != Conversation.uuid;
                    samePrompt || (prevMessages = JSON.parse(JSON.stringify(messages)));
                    let type = '';
                    if (apiKey) { type = 'api'; } else if (retryRegen) { //if (retryRegen) {
                        type = 'R';
                        fetchAPI = await (async (signal, model) => {
                            let res;
                            const body = {
                                prompt: '',
                                parent_message_uuid: '',
                                timezone: AI.zone(),
                                attachments: [],
                            	files: [],
                                rendering_mode: 'raw'
                            };
                            let headers = {
                                ...AI.hdr(Conversation.uuid || ''),
                                Accept: 'text/event-stream',
                                Cookie: getCookies()
                            };
                            if (Config.Settings.Superfetch) {
                                const names = Object.keys(headers), values = Object.values(headers);
                                headers = names.map(((header, idx) => `${header}: ${values[idx]}`));
                            }
                            res = await (Config.Settings.Superfetch ? Superfetch : fetch)((Config.rProxy || AI.end()) + `/api/organizations/${uuidOrg || ''}/chat_conversations/${Conversation.uuid || ''}/retry_completion`, {
                                stream: true,
                                signal,
                                method: 'POST',
                                body: JSON.stringify(body),
                                headers
                            });
                            updateParams(res);
                            await checkResErr(res);
                            return res;
                        })(signal, model);
                    } else if (shouldRenew) {
                        Conversation.uuid && await deleteChat(Conversation.uuid);
                        fetchAPI = await (async signal => {
                            Conversation.uuid = randomUUID().toString();
                            Conversation.depth = 0;
                            const res = await (Config.Settings.Superfetch ? Superfetch : fetch)(`${Config.rProxy || AI.end()}/api/organizations/${uuidOrg}/chat_conversations`, {
                                signal,
                                headers: {
                                    ...AI.hdr(),
                                    Cookie: getCookies()
                                },
                                method: 'POST',
                                body: JSON.stringify({
                                    uuid: Conversation.uuid,
                                    name: ''
                                })
                            });
                            updateParams(res);
                            await checkResErr(res);
                            return res;
                        })(signal);
                        type = 'r';
                    } else if (samePrompt) {} else {
                        const systemExperiment = !Config.Settings.RenewAlways && Config.Settings.SystemExperiments;
                        if (!systemExperiment || systemExperiment && Conversation.depth >= Config.SystemInterval) {
                            type = 'c-r';
                            Conversation.depth = 0;
                        } else {
                            type = 'c-c';
                            Conversation.depth++;
                        }
                    }
                    let {prompt, systems} = ((messages, type) => {
                        const rgxScenario = /^\[Circumstances and context of the dialogue: ([\s\S]+?)\.?\]$/i, rgxPerson = /^\[([\s\S]+?)'s personality: ([\s\S]+?)\]$/i, messagesClone = JSON.parse(JSON.stringify(messages)), realLogs = messagesClone.filter((message => [ 'user', 'assistant' ].includes(message.role))), sampleLogs = messagesClone.filter((message => message.name)), mergedLogs = [ ...sampleLogs, ...realLogs ];
                        mergedLogs.forEach(((message, idx) => {
                            const next = mergedLogs[idx + 1];
                            message.customname = (message => [ 'assistant', 'user' ].includes(message.role) && null != message.name && !(message.name in Replacements))(message);
                            if (next && !Config.Settings.xmlPlot) { //if (next) {
                                if ('name' in message && 'name' in next) {
                                    if (message.name === next.name) {
                                        message.content += '\n' + next.content;
                                        next.merged = true;
                                    }
                                } else if ('system' !== next.role) {
                                    if (next.role === message.role) {
                                        message.content += '\n' + next.content;
                                        next.merged = true;
                                    }
                                } else {
                                    message.content += '\n' + next.content;
                                    next.merged = true;
                                }
                            }
                        }));
                        const lastAssistant = realLogs.findLast((message => !message.merged && 'assistant' === message.role));
                        lastAssistant && Config.Settings.StripAssistant && (lastAssistant.strip = true);
                        const lastUser = realLogs.findLast((message => !message.merged && 'user' === message.role));
                        lastUser && Config.Settings.StripHuman && (lastUser.strip = true);
                        const systemMessages = messagesClone.filter((message => 'system' === message.role && !('name' in message)));
                        systemMessages.forEach(((message, idx) => {
                            const scenario = message.content.match(rgxScenario)?.[1], personality = message.content.match(rgxPerson);
                            if (scenario) {
                                message.content = Config.ScenarioFormat.replace(/{{scenario}}/gim, scenario);
                                message.scenario = true;
                            }
                            if (3 === personality?.length) {
                                message.content = Config.PersonalityFormat.replace(/{{char}}/gim, personality[1]).replace(/{{personality}}/gim, personality[2]);
                                message.personality = true;
                            }
                            message.main = 0 === idx;
                            message.jailbreak = idx === systemMessages.length - 1;
                            ' ' === message.content && (message.discard = true);
                        }));
                        Config.Settings.AllSamples && !Config.Settings.NoSamples && realLogs.forEach((message => {
                            if (![ lastUser, lastAssistant ].includes(message)) {
                                if ('user' === message.role) {
                                    message.name = message.customname ? message.name : 'example_user';
                                    message.role = 'system';
                                } else if ('assistant' === message.role) {
                                    message.name = message.customname ? message.name : 'example_assistant';
                                    message.role = 'system';
                                } else if (!message.customname) {
                                    throw Error('Invalid role ' + message.name);
                                }
                            }
                        }));
                        Config.Settings.NoSamples && !Config.Settings.AllSamples && sampleLogs.forEach((message => {
                            if ('example_user' === message.name) {
                                message.role = 'user';
                            } else if ('example_assistant' === message.name) {
                                message.role = 'assistant';
                            } else if (!message.customname) {
                                throw Error('Invalid role ' + message.name);
                            }
                            message.customname || delete message.name;
                        }));
                        let systems = [];
                        if (![ 'r', 'R', 'api' ].includes(type)) {
                            lastUser.strip = true;
                            systemMessages.forEach((message => message.discard = message.discard || 'c-c' === type ? !message.jailbreak : !message.jailbreak && !message.main));
                            systems = systemMessages.filter((message => !message.discard)).map((message => `"${message.content.substring(0, 25).replace(/\n/g, '\\n').trim()}..."`));
                            messagesClone.forEach((message => message.discard = message.discard || mergedLogs.includes(message) && ![ lastUser ].includes(message)));
                        }
                        const prompt = messagesClone.map(((message, idx) => {
                            if (message.merged || message.discard) {
                                return '';
                            }
                            if (message.content.length < 1) {
                                return message.content;
                            }
                            let spacing = '';
/******************************** */
                            if (Config.Settings.xmlPlot) {
                                idx > 0 && (spacing = '\n\n');
                                const prefix = message.customname ? message.role + ': ' + message.name.replaceAll('_', ' ') + ': ' : 'system' !== message.role || message.name ? Replacements[message.name || message.role] + ': ' : 'xmlPlot: ' + Replacements[message.role];
                                return `${spacing}${message.strip ? '' : prefix}${message.content}`;
                            } else {
/******************************** */
                                idx > 0 && (spacing = systemMessages.includes(message) ? '\n' : '\n\n');
                                const prefix = message.customname ? message.name.replaceAll('_', ' ') + ': ' : 'system' !== message.role || message.name ? Replacements[message.name || message.role] + ': ' : '' + Replacements[message.role];
                                return `${spacing}${message.strip ? '' : prefix}${'system' === message.role ? message.content : message.content.trim()}`;
                            } //
                        }));
                        return {
                            prompt: prompt.join(''), //genericFixes(prompt.join('')).trim(),
                            systems
                        };
                    })(messages, type);
/******************************** */
                    const legacy = /claude-([12]|instant)/i.test(model), messagesAPI = thirdKey || !legacy && !/<\|completeAPI\|>/.test(prompt) || /<\|messagesAPI\|>/.test(prompt), messagesLog = /<\|messagesLog\|>/.test(prompt), fusion = apiKey && messagesAPI && /<\|Fusion Mode\|>/.test(prompt), wedge = '\r';
                    const stopSet = /<\|stopSet *(\[.*?\]) *\|>/.exec(prompt)?.[1], stopRevoke = /<\|stopRevoke *(\[.*?\]) *\|>/.exec(prompt)?.[1];
                    if (stop_sequences || stopSet || stopRevoke) stop_sequences = JSON.parse(stopSet || '[]').concat(stop_sequences).concat(['\n\nHuman:', '\n\nAssistant:']).filter(item => !JSON.parse(stopRevoke || '[]').includes(item) && item);
                    apiKey && (type = oaiAPI ? 'oai_api' : messagesAPI ? 'msg_api' : type);
                    prompt = Config.Settings.xmlPlot ? xmlPlot(prompt, legacy && !/claude-2\.1/i.test(model)) : apiKey ? `\n\nHuman: ${genericFixes(prompt)}\n\nAssistant:` : genericFixes(prompt).trim();
                    Config.Settings.FullColon && (prompt = !legacy ?
                        prompt.replace(fusion ? /\n(?!\nAssistant:\s*$)(?=\n(Human|Assistant):)/gs : apiKey ? /(?<!\n\nHuman:.*)\n(?=\nAssistant:)|\n(?=\nHuman:)(?!.*\n\nAssistant:)/gs : /\n(?=\n(Human|Assistant):)/g, '\n' + wedge) : 
                        prompt.replace(fusion ? /(?<=\n\nAssistant):(?!\s*$)|(?<=\n\nHuman):/gs : apiKey ? /(?<!\n\nHuman:.*)(?<=\n\nAssistant):|(?<=\n\nHuman):(?!.*\n\nAssistant:)/gs : /(?<=\n\n(Human|Assistant)):/g, '﹕'));
                    prompt = padtxt(prompt);
/******************************** */
                    console.log(`${model} [[2m${type}[0m]${!retryRegen && systems.length > 0 ? ' ' + systems.join(' [33m/[0m ') : ''}`);
                    'R' !== type || prompt || (prompt = '...regen...');
                    Logger?.write(`\n\n-------\n[${(new Date).toLocaleString()}]\n${Main}\n####### ${model} (${type})\n${JSON.stringify({FusionMode: fusion, PassParams: Config.Settings.PassParams, stop_sequences, temperature, top_k, top_p}, null, 2)}\n\n####### regex:\n${regexLog}\n####### PROMPT ${tokens}t:\n${prompt}\n--\n####### REPLY:\n`); //Logger?.write(`\n\n-------\n[${(new Date).toLocaleString()}]\n####### MODEL: ${model}\n####### PROMPT (${type}):\n${prompt}\n--\n####### REPLY:\n`);
                    retryRegen || (fetchAPI = await (async (signal, model, prompt, temperature, type) => {
/******************************** */
                        if (apiKey) {
                            let messages, system, key = apiKey[Math.floor(Math.random() * apiKey.length)];
                            if (messagesAPI) {
                                const rounds = prompt.replace(/^(?!.*\n\nHuman:)/s, '\n\nHuman:').split('\n\nHuman:');
                                messages = rounds.slice(1).flatMap(round => {
                                    const turns = round.split('\n\nAssistant:');
                                    return [{role: 'user', content: turns[0].trim()}].concat(turns.slice(1).flatMap(turn => [{role: 'assistant', content: turn.trim()}]));
                                }).reduce((acc, current) => {
                                    if (Config.Settings.FullColon && acc.length > 0 && (acc[acc.length - 1].role === current.role || !acc[acc.length - 1].content)) {
                                        acc[acc.length - 1].content += (current.role === 'user' ? 'Human' : 'Assistant').replace(/.*/, legacy ? '\n$&﹕ ' : '\n' + wedge + '\n$&: ') + current.content;
                                    } else acc.push(current);
                                    return acc;
                                }, []).filter(message => message.content), oaiAPI ? messages.unshift({role: 'system', content: rounds[0].trim()}) : system = rounds[0].trim();
                                messagesLog && console.log({system, messages});
                            }
                            const res = await fetch((api_rProxy || 'https://api.anthropic.com').replace(/(\/v1)? *$/, thirdKey ? '$1' : '/v1').trim('/') + (oaiAPI ? '/chat/completions' : messagesAPI ? '/messages' : '/complete'), {
                                method: 'POST',
                                signal,
                                headers: {
                                    'anthropic-version': '2023-06-01',
                                    'authorization': 'Bearer ' + key,
                                    'Content-Type': 'application/json',
                                    'User-Agent': AI.agent(),
                                    'x-api-key': key,
                                },
                                body: JSON.stringify({
                                    ...oaiAPI || messagesAPI ? {
                                        max_tokens : max_tokens_to_sample,
                                        messages,
                                        system
                                    } : {
                                        max_tokens_to_sample,
                                        prompt
                                    },
                                    model,
                                    stop_sequences,
                                    stream: true,
                                    temperature,
                                    top_k,
                                    top_p
                                }),
                            });
                            await checkResErr(res);
                            return res;
                        }
/******************************** */
                        const attachments = [];
                        if (Config.Settings.PromptExperiments) {
                            let splitedprompt = prompt.split('\n\nPlainPrompt:'); //
                            prompt = splitedprompt[0]; //
                            attachments.push({
                                extracted_content: prompt,
                                file_name: 'paste.txt',  //fileName(),
                                file_type: 'txt', //'text/plain',
                                file_size: Buffer.from(prompt).byteLength
                            });
                            prompt = 'r' === type ? Config.PromptExperimentFirst : Config.PromptExperimentNext;
                            splitedprompt.length > 1 && (prompt += splitedprompt[1]); //
                        }
                        let res;
                        const body = {
                            attachments,
                            files: [],
                            model: isPro || forceModel ? model : undefined,
                            rendering_mode: 'raw',
                            ...Config.Settings.PassParams && {
                                max_tokens_to_sample, //
                                //stop_sequences, //
                                top_k, //
                                top_p, //
                                temperature
                            },
                            prompt: prompt || '',
                            timezone: AI.zone()
                        };
                        let headers = {
                            ...AI.hdr(Conversation.uuid || ''),
                            Accept: 'text/event-stream',
                            Cookie: getCookies()
                        };
                        res = await (Config.Settings.Superfetch ? Superfetch : fetch)(`${Config.rProxy || AI.end()}/api/organizations/${uuidOrg || ''}/chat_conversations/${Conversation.uuid || ''}/completion`, {
                            stream: true,
                            signal,
                            method: 'POST',
                            body: JSON.stringify(body),
                            headers
                        });
                        updateParams(res);
                        await checkResErr(res);
                        return res;
                    })(signal, model, prompt, temperature, type));
                    const response = Writable.toWeb(res);
                    clewdStream = new ClewdStream({
                        config: {
                            ...Config,
                            Settings: {
                                ...Config.Settings,
                                Superfetch: apiKey ? false : Config.Settings.Superfetch
                            }
                        }, //config: Config,
                        version: Main,
                        minSize: Config.BufferSize,
                        model,
                        streaming: true === body.stream,
                        abortControl,
                        source: fetchAPI
                    }, Logger);
                    titleTimer = setInterval((() => setTitle('recv ' + bytesToSize(clewdStream.size))), 300);
                    (!apiKey && Config.Settings.Superfetch) ? await Readable.toWeb(fetchAPI.body).pipeThrough(clewdStream).pipeTo(response) : await fetchAPI.body.pipeThrough(clewdStream).pipeTo(response); //Config.Settings.Superfetch ? await Readable.toWeb(fetchAPI.body).pipeThrough(clewdStream).pipeTo(response) : await fetchAPI.body.pipeThrough(clewdStream).pipeTo(response);
                } catch (err) {
                    if ('AbortError' === err.name) {
                        res.end();
                    } else {
                        nochange = true, exceeded_limit = err.exceeded_limit; //
                        err.planned ? console.log(`[33m${err.status || 'Aborted'}![0m\n`) : console.error('[33mClewd:[0m\n%o', err); //err.planned || console.error('[33mClewd:[0m\n%o', err);
                        res.json({
                            error: {
                                message: 'clewd: ' + (err.message || err.name || err.type),
                                type: err.type || err.name || err.code,
                                param: null,
                                code: err.code || 500
                            }
                        }, 500);
                    }
                }
                clearInterval(titleTimer);
                if (clewdStream) {
                    clewdStream.censored && console.warn('[33mlikely your account is hard-censored[0m');
                    prevImpersonated = clewdStream.impersonated;
                    exceeded_limit = clewdStream.error.exceeded_limit; //
                    clewdStream.error.status < 200 || clewdStream.error.status >= 300 || clewdStream.error.message === 'Overloaded' && (nochange = true); //
                    setTitle('ok ' + bytesToSize(clewdStream.size));
                    if (clewdStream.compModel && !(AI.mdl().includes(clewdStream.compModel) || Config.unknownModels.includes(clewdStream.compModel)) && !apiKey) {
                        Config.unknownModels.push(clewdStream.compModel);
                        writeSettings(Config);
                    }
                    console.log(`${200 == fetchAPI.status ? '[32m' : '[33m'}${fetchAPI.status}![0m\n`);
                    clewdStream.empty();
                }
                const shouldChange = exceeded_limit || !nochange && Config.Cookiecounter > 0 && changeflag++ >= Config.Cookiecounter - 1; //
                if (!apiKey && (shouldChange || prevImpersonated)) { //if (prevImpersonated) {
                    try {
                        await deleteChat(Conversation.uuid);
                    } catch (err) {}
/******************************** */
                    if (shouldChange) {
                        exceeded_limit && console.log(`[35mExceeded limit![0m\n`);
                        changeflag = 0;
                        CookieChanger();
                    }
/******************************** */
                }
            }));
        })(req, res);
        break;

      case '/v1/complete':
        res.json({
            error: {
                message: 'clewd: Set "Chat Completion source" to OpenAI instead of Claude. Enable "External" models aswell',
                code: 404
            }
        }, 404);
        break;

      case '/cookie-manager':
        ((req, res) => {
            res.writeHead(200, {
                'Content-Type': 'text/html',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Claude Cookie 管理器</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 960px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
            color: #333;
        }
        h1 {
            text-align: center;
            color: #2c3e50;
        }
        .container {
            background-color: white;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        }
        .form-group {
            margin-bottom: 15px;
        }
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
        }
        textarea {
            width: 100%;
            height: 150px;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
        }
        input[type="text"] {
            width: 100%;
            padding: 8px;
            border: 1px solid #ddd;
            border-radius: 4px;
        }
        button {
            background-color: #3498db;
            color: white;
            border: none;
            padding: 10px 15px;
            border-radius: 4px;
            cursor: pointer;
            margin-right: 10px;
        }
        button:hover {
            background-color: #2980b9;
        }
        .cookie-list {
            margin-top: 20px;
        }
        .cookie-item {
            background-color: #f9f9f9;
            padding: 10px;
            margin-bottom: 8px;
            border-radius: 4px;
            border-left: 3px solid #3498db;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .cookie-current {
            border-left: 3px solid #2ecc71;
            background-color: #eafaf1;
        }
        .cookie-text {
            word-break: break-all;
            flex: 1;
        }
        .btn-danger {
            background-color: #e74c3c;
        }
        .btn-danger:hover {
            background-color: #c0392b;
        }
        .btn-check {
            background-color: #2ecc71;
            margin-right: 5px;
        }
        .btn-check:hover {
            background-color: #27ae60;
        }
        .cookie-status {
            margin-left: 10px;
            padding: 3px 8px;
            border-radius: 3px;
            font-size: 0.8em;
        }
        .status-valid {
            background-color: #2ecc71;
            color: white;
        }
        .status-invalid {
            background-color: #e74c3c;
            color: white;
        }
        .status-unknown {
            background-color: #f1c40f;
            color: #333;
        }
        .status-warning {
            background-color: #f39c12;
            color: white;
        }
        .cookie-type {
            margin-left: 10px;
            font-size: 0.8em;
            color: #7f8c8d;
            font-weight: bold;
        }
        .stats {
            margin-top: 20px;
            padding: 10px;
            background-color: #ecf0f1;
            border-radius: 4px;
            text-align: center;
        }
        .btn-group {
            margin: 15px 0;
            display: flex;
            justify-content: space-between;
        }
        .success-message {
            background-color: #d4edda;
            color: #155724;
            padding: 10px;
            border-radius: 4px;
            margin-bottom: 15px;
            display: none;
        }
        .restart-btn {
            background-color: #e74c3c;
            color: white;
            padding: 8px 15px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            margin-top: 20px;
            font-weight: bold;
        }
        .restart-btn:hover {
            background-color: #c0392b;
        }
    </style>
</head>
<body>
    <h1>Claude Cookie 管理器</h1>
    <div class="container">
        <div id="successMessage" class="success-message"></div>
        
        <div class="form-group">
            <label for="cookieInput">输入多个 Cookie（每行一个）</label>
            <textarea id="cookieInput" placeholder="输入格式如：sk-ant-sid01-XXX...AAA"></textarea>
            <p style="margin-top: 5px; color: #666; font-size: 0.9em;">注意：所有没有前缀的Cookie将自动添加"claude_pro@"前缀</p>
        </div>
        
        <div class="btn-group">
            <div>
                <button id="addCookiesBtn">添加 Cookie</button>
                <button id="clearInputBtn">清空输入</button>
            </div>
            <div>
                <button id="refreshBtn">刷新列表</button>
            </div>
        </div>
        
        <div class="stats">
            <p>当前共有 <span id="cookieCount">0</span> 个 Cookie</p>
            <button id="checkAllBtn" class="btn-check">检查全部Cookie有效性</button>
        </div>
        
        <h2>Cookie 列表</h2>
        <div id="cookieList" class="cookie-list">
            <div class="cookie-item">
                <span>加载中...</span>
            </div>
        </div>
        
        <button id="restartBtn" class="restart-btn">重启服务器</button>
    </div>

    <script>
        // 获取当前Cookie列表
        async function getCookies() {
            try {
                const response = await fetch('/cookie-api/list');
                if (!response.ok) {
                    throw new Error('获取Cookie列表失败');
                }
                const data = await response.json();
                return data;
            } catch (error) {
                console.error('获取Cookie失败:', error);
                return { cookies: [], count: 0 };
            }
        }

        // 刷新Cookie列表
        async function refreshCookieList() {
            const cookieList = document.getElementById('cookieList');
            const cookieCount = document.getElementById('cookieCount');
            
            try {
                const data = await getCookies();
                cookieCount.textContent = data.count;
                
                if (data.cookies.length === 0) {
                    cookieList.innerHTML = '<div class="cookie-item"><span>没有Cookie</span></div>';
                    return;
                }
                
                cookieList.innerHTML = '';
                data.cookies.forEach((cookie, index) => {
                    const item = document.createElement('div');
                    item.className = 'cookie-item';
                    // 标记当前使用的Cookie
                    if (index === data.currentIndex) {
                        item.className += ' cookie-current';
                    }
                    
                    // 提取和显示cookie，隐藏中间部分
                    const cookieValue = cookie.split('@')[1] || cookie;
                    const displayCookie = cookieValue.replace(/^(sessionKey=)?(sk-ant-sid01-[\w-]{6}).*?([\w-]{6}AA)$/g, '$1$2....$3');
                    const prefix = cookie.split('@')[0] || '';
                    const displayText = prefix ? prefix + '@' + displayCookie : displayCookie;
                    
                    const isCurrentLabel = index === data.currentIndex ? '<span style="color:#16a085;font-weight:bold;">[当前使用]</span> ' : '';
                    
                    item.innerHTML = 
                        '<span class="cookie-text">' + (index + 1) + '. ' + isCurrentLabel + displayText + '</span>' +
                        '<div>' +
                            '<span class="cookie-status status-unknown" id="status-' + index + '">未检查</span>' +
                            '<span class="cookie-type" id="type-' + index + '"></span>' +
                            '<button class="btn-check" data-index="' + index + '">检查</button>' +
                            '<button class="btn-danger" data-index="' + index + '">删除</button>' +
                        '</div>';
                    cookieList.appendChild(item);
                });
                
                // 添加删除事件监听
                document.querySelectorAll('.btn-danger').forEach(button => {
                    button.addEventListener('click', async () => {
                        const index = button.getAttribute('data-index');
                        await deleteCookie(index);
                    });
                });
                
                // 添加检查事件监听
                document.querySelectorAll('.btn-check').forEach(button => {
                    button.addEventListener('click', async () => {
                        const index = button.getAttribute('data-index');
                        await checkCookie(index);
                    });
                });
            } catch (error) {
                console.error('刷新列表失败:', error);
                cookieList.innerHTML = '<div class="cookie-item"><span>加载失败</span></div>';
            }
        }

        // 添加Cookie
        async function addCookies() {
            const input = document.getElementById('cookieInput');
            const cookieText = input.value.trim();
            
            if (!cookieText) {
                showMessage('请输入Cookie');
                return;
            }
            
            try {
                const response = await fetch('/cookie-api/add', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ cookies: cookieText })
                });
                
                if (!response.ok) {
                    throw new Error('添加Cookie失败');
                }
                
                const result = await response.json();
                showMessage(\`成功添加 \${result.added} 个Cookie\`);
                input.value = '';
                refreshCookieList();
            } catch (error) {
                console.error('添加Cookie失败:', error);
                showMessage('添加Cookie失败: ' + error.message);
            }
        }

        // 删除Cookie
        async function deleteCookie(index) {
            if (!confirm('确认删除这个Cookie?')) {
                return;
            }
            
            try {
                const response = await fetch('/cookie-api/delete', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ index })
                });
                
                if (!response.ok) {
                    throw new Error('删除Cookie失败');
                }
                
                showMessage('Cookie删除成功');
                refreshCookieList();
            } catch (error) {
                console.error('删除Cookie失败:', error);
                showMessage('删除Cookie失败: ' + error.message);
            }
        }

        // 显示消息
        function showMessage(message) {
            const messageElement = document.getElementById('successMessage');
            messageElement.textContent = message;
            messageElement.style.display = 'block';
            
            setTimeout(() => {
                messageElement.style.display = 'none';
            }, 3000);
        }
        
        // 检查Cookie有效性
        async function checkCookie(index) {
            const statusEl = document.getElementById("status-" + index);
            const typeEl = document.getElementById("type-" + index);
            
            // 更新状态为检查中
            statusEl.textContent = '检查中...';
            statusEl.className = 'cookie-status status-unknown';
            typeEl.textContent = '';
            
            try {
                const response = await fetch('/cookie-api/check', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ index })
                });
                
                if (!response.ok) {
                    throw new Error('检查Cookie失败');
                }
                
                const result = await response.json();
                
                // 更新状态显示
                statusEl.textContent = result.status;
                
                // 根据状态设置不同的样式
                if (result.isValid) {
                    if (result.status === '正常') {
                        statusEl.className = 'cookie-status status-valid';
                    } else {
                        // 有效但有警告（例如"账户受限"）
                        statusEl.className = 'cookie-status status-warning';
                    }
                } else {
                    statusEl.className = 'cookie-status status-invalid';
                }
                
                // 显示Cookie类型
                if (result.type) {
                    typeEl.textContent = result.type;
                }
                
            } catch (error) {
                console.error('检查Cookie失败:', error);
                statusEl.textContent = '检查失败';
                statusEl.className = 'cookie-status status-invalid';
            }
        }
        
        // 重启服务器
        async function restartServer() {
            if (!confirm('确定要重启服务器吗？重启期间服务将暂时不可用。')) {
                return;
            }
            
            try {
                showMessage('服务器正在重启...');
                const response = await fetch('/cookie-api/restart');
                if (!response.ok) {
                    throw new Error('重启请求失败');
                }
                
                // 倒计时，显示重启中
                let countdown = 5;
                showMessage('服务器正在重启，' + countdown + '秒后刷新页面...');
                
                const countdownInterval = setInterval(() => {
                    countdown--;
                    showMessage('服务器正在重启，' + countdown + '秒后刷新页面...');
                    
                    if (countdown <= 0) {
                        clearInterval(countdownInterval);
                        window.location.reload();
                    }
                }, 1000);
                
            } catch (error) {
                console.error('重启服务器失败:', error);
                showMessage('重启服务器失败: ' + error.message);
            }
        }

        // 事件监听器
        document.addEventListener('DOMContentLoaded', () => {
            refreshCookieList();
            
            document.getElementById('addCookiesBtn').addEventListener('click', addCookies);
            
            document.getElementById('clearInputBtn').addEventListener('click', () => {
                document.getElementById('cookieInput').value = '';
            });
            
            document.getElementById('refreshBtn').addEventListener('click', refreshCookieList);
            
            document.getElementById('restartBtn').addEventListener('click', restartServer);
            
            document.getElementById('checkAllBtn').addEventListener('click', checkAllCookies);
        });
        
        // 检查所有Cookie
        async function checkAllCookies() {
            const cookieCount = document.getElementById('cookieCount').textContent;
            if (cookieCount == 0) {
                showMessage('没有Cookie可检查');
                return;
            }
            
            showMessage('开始检查所有Cookie...');
            
            // 获取所有检查按钮并依次点击
            const buttons = document.querySelectorAll('.btn-check[data-index]');
            for (let i = 0; i < buttons.length; i++) {
                const index = buttons[i].getAttribute('data-index');
                await checkCookie(index);
                // 添加短暂延迟，避免请求过于频繁
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            showMessage('所有Cookie检查完成');
        }
    </script>
</body>
</html>
            `);
        })(req, res);
        break;

      case '/cookie-api/list':
        ((req, res) => {
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify({ 
                cookies: Config.CookieArray, 
                count: Config.CookieArray.length,
                currentIndex: currentIndex 
            }));
        })(req, res);
        break;

      case '/cookie-api/add':
        ((req, res) => {
            const buffer = [];
            req.on('data', (chunk => {
                buffer.push(chunk);
            }));
            req.on('end', (() => {
                try {
                    const data = JSON.parse(Buffer.concat(buffer).toString());
                    if (!data.cookies) {
                        return res.json({ error: 'No cookies provided' }, 400);
                    }

                    // 提取所有匹配的 cookie
                    const cookiesText = data.cookies;
                    const cookieLines = cookiesText.split('\n').filter(line => line.trim() !== '');
                    const processedCookies = [];
                    
                    for (const line of cookieLines) {
                        // 检查是否已有claude_pro@前缀或是否已是完整格式
                        if (line.includes('@') || line.startsWith('claude_pro@') || line.startsWith('claude_team_pro@')) {
                            // 已有前缀，保持原样
                            processedCookies.push(line);
                        } else {
                            // 添加默认前缀
                            const cookieValue = line.startsWith('sessionKey=') ? line : 'sessionKey=' + line;
                            processedCookies.push('claude_pro@' + cookieValue);
                        }
                    }
                    
                    if (processedCookies.length === 0) {
                        return res.json({ error: 'No valid cookies found' }, 400);
                    }

                    // 匹配有效的Claude cookies
                    const validCookies = processedCookies.filter(cookie => 
                        /^(claude[-_][a-z0-9-_]*?@)?(sessionKey=)?sk-ant-sid01-[\w-]{86}-[\w-]{6}AA/.test(cookie)
                    );
                    
                    if (validCookies.length === 0) {
                        return res.json({ error: 'No valid cookies found' }, 400);
                    }
                    
                    // 统计原始和新增的 cookie 数量
                    const originalCount = Config.CookieArray.length;
                    
                    // 添加到 CookieArray (避免重复)
                    const newCookies = validCookies.filter(cookie => !Config.CookieArray.includes(cookie));
                    Config.CookieArray.push(...newCookies);
                    
                    // 保存配置
                    writeSettings(Config);
                    
                    res.json({ 
                        success: true, 
                        added: newCookies.length,
                        total: Config.CookieArray.length
                    });
                } catch (error) {
                    console.error('Error processing cookie add request:', error);
                    res.json({ error: 'Invalid request' }, 400);
                }
            }));
        })(req, res);
        break;

      case '/cookie-api/delete':
        ((req, res) => {
            const buffer = [];
            req.on('data', (chunk => {
                buffer.push(chunk);
            }));
            req.on('end', (() => {
                try {
                    const data = JSON.parse(Buffer.concat(buffer).toString());
                    const index = parseInt(data.index);
                    
                    if (isNaN(index) || index < 0 || index >= Config.CookieArray.length) {
                        return res.json({ error: 'Invalid cookie index' }, 400);
                    }
                    
                    // 删除指定 cookie
                    Config.CookieArray.splice(index, 1);
                    
                    // 保存配置
                    writeSettings(Config);
                    
                    res.json({ 
                        success: true, 
                        total: Config.CookieArray.length 
                    });
                } catch (error) {
                    console.error('Error processing cookie delete request:', error);
                    res.json({ error: 'Invalid request' }, 400);
                }
            }));
        })(req, res);
        break;

      case '/cookie-api/restart':
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, message: '服务器正在重启...' }));
        console.log('\n[33m正在准备重启服务器...[0m');
        
        // 根据操作系统类型选择启动不同的脚本
        const { exec } = require('child_process');
        const isWin = process.platform === "win32";
        
        setTimeout(() => {
            console.log('[32m即将重启服务器...[0m');
            try {
                const path = require('path');
                
                if (isWin) {
                    // Windows系统：启动start.bat
                    exec('start .\\start.bat', {
                        windowsHide: false,
                        cwd: path.resolve(__dirname)
                    });
                } else {
                    // Linux/Mac系统：启动start.sh
                    exec('sh ./start.sh', {
                        cwd: path.resolve(__dirname)
                    });
                }
                
                // 稍作延迟后退出当前进程
                setTimeout(() => {
                    process.exit();
                }, 1000);
            } catch (error) {
                console.error('[31m重启失败:[0m', error);
            }
        }, 1000);
        break;

      case '/cookie-api/check':
        ((req, res) => {
            const buffer = [];
            req.on('data', (chunk => {
                buffer.push(chunk);
            }));
            req.on('end', (async () => {
                try {
                    const data = JSON.parse(Buffer.concat(buffer).toString());
                    const index = parseInt(data.index);
                    
                    if (isNaN(index) || index < 0 || index >= Config.CookieArray.length) {
                        return res.json({ error: 'Invalid cookie index' }, 400);
                    }
                    
                    // 获取要检查的cookie
                    const cookie = Config.CookieArray[index];
                    let isValid = false;
                    let statusMessage = '';
                    let cookieType = '';
                    
                    try {
                        // 更新cookies对象
                        const cookieInfo = /(?:(claude[-_][a-z0-9-_]*?)@)?(?:sessionKey=)?(sk-ant-sid01-[\w-]{86}-[\w-]{6}AA)/.exec(cookie);
                        if (cookieInfo?.[2]) {
                            // 清除之前的cookie
                            Object.keys(cookies).forEach(key => {
                                delete cookies[key];
                            });
                            
                            // 设置当前要检测的cookie
                            updateCookies('sessionKey=' + cookieInfo[2]);
                            
                            // 发送请求检查cookie有效性
                            const bootstrapRes = await (Config.Settings.Superfetch ? Superfetch : fetch)((Config.rProxy || AI.end()) + `/api/bootstrap`, {
                                method: 'GET',
                                headers: {
                                    ...AI.hdr(),
                                    Cookie: getCookies()
                                }
                            });
                            
                            // 请求成功，检查返回结果
                            const bootstrap = await bootstrapRes.json();
                            
                            if (bootstrap.account === null || !bootstrap.account) {
                                statusMessage = '无效（账户为空）';
                            } else {
                                isValid = true;
                                // 添加防御性检查，确保memberships存在
                                if (!bootstrap.account.memberships || !Array.isArray(bootstrap.account.memberships)) {
                                    statusMessage = '账户信息不完整';
                                    isValid = false;
                                } else {
                                    const bootAccInfo = bootstrap.account.memberships.find(item => item.organization && item.organization.capabilities && item.organization.capabilities.includes('chat'))?.organization;
                                    
                                    if (bootAccInfo) {
                                        const isPro = (bootAccInfo.capabilities && bootAccInfo.capabilities.includes('claude_pro')) && 'claude_pro' || 
                                                      (bootAccInfo.capabilities && bootAccInfo.capabilities.includes('raven')) && 'claude_team_pro';
                                        cookieType = isPro || 
                                                    (bootstrap.statsig?.values?.layer_configs && bootstrap.statsig.values.layer_configs["HPOHwBLNLQLxkj5Yn4bfSkgCQnBX28kPR7h/BNKdVLw="]?.value?.console_default_model_override?.model) || 
                                                    (bootstrap.statsig?.values?.dynamic_configs && bootstrap.statsig.values.dynamic_configs["6zA9wvTedwkzjLxWy9PVe7yydI00XDQ6L5Fejjq/2o8="]?.value?.model) || 
                                                    'claude';
                                        
                                        // 检查账户状态
                                        if (bootAccInfo.api_disabled_reason) {
                                            statusMessage = '账户已禁用';
                                            isValid = false;
                                        } else if (!bootstrap.account.completed_verification_at) {
                                            statusMessage = '账户未验证';
                                            isValid = false;
                                        } else if (bootAccInfo.active_flags && bootAccInfo.active_flags.length > 0) {
                                            const banned = bootAccInfo.active_flags.some(flag => flag.type === 'consumer_banned');
                                            if (banned) {
                                                statusMessage = '账户已封禁';
                                                isValid = false;
                                            } else {
                                                statusMessage = '账户受限';
                                            }
                                        } else {
                                            statusMessage = '正常';
                                        }
                                    } else {
                                        statusMessage = '无法获取账户信息';
                                        isValid = false;
                                    }
                                }
                            }
                        } else {
                            statusMessage = 'Cookie格式错误';
                        }
                    } catch (error) {
                        console.error('测试Cookie出错:', error);
                        statusMessage = '请求失败: ' + (error.message || '未知错误');
                        
                        // 特别处理403权限错误
                        if (error.status === 403 && error.isCookieError) {
                            statusMessage = 'Cookie已过期';
                        }
                    }
                    
                    res.json({ 
                        success: true,
                        isValid,
                        status: statusMessage,
                        type: cookieType
                    });
                } catch (error) {
                    console.error('Error processing cookie check request:', error);
                    res.json({ error: 'Invalid request' }, 400);
                }
            }));
        })(req, res);
        break;

      default:
        !['/', '/v1', '/favicon.ico'].includes(req.url) && (console.log('unknown request: ' + req.url)); //console.log('unknown request: ' + req.url);
        res.writeHead(200, {'Content-Type': 'text/html'}); //
        res.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<script>
function copyToClipboard(text) {
  var textarea = document.createElement("textarea");
  textarea.textContent = text;
  textarea.style.position = "fixed";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    return document.execCommand("copy");
  } catch (ex) {
    console.warn("Copy to clipboard failed.", ex);
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}
function copyLink(event) {
  event.preventDefault();
  const url = new URL(window.location.href);
  const link = url.protocol + '//' + url.host + '/v1';
  copyToClipboard(link);
  alert('链接已复制: ' + link);
}
async function restartServer() {
  if (!confirm('确定要重启服务器吗？重启期间服务将暂时不可用。')) {
    return;
  }
  try {
    const response = await fetch('/cookie-api/restart');
    if (response.ok) {
      alert('服务器正在重启，请等待几秒后刷新页面');
      setTimeout(() => { window.location.reload(); }, 5000);
    } else {
      alert('重启请求失败');
    }
  } catch (error) {
    alert('重启服务器失败: ' + error.message);
  }
}
</script>
<style>
.manage-link {
  display: inline-block;
  margin: 10px 0;
  padding: 8px 15px;
  background-color: #3498db;
  color: white;
  text-decoration: none;
  border-radius: 4px;
}
.manage-link:hover {
  background-color: #2980b9;
}
.restart-btn {
  display: inline-block;
  margin: 10px 0;
  padding: 8px 15px;
  background-color: #e74c3c;
  color: white;
  text-decoration: none;
  border-radius: 4px;
  cursor: pointer;
}
.restart-btn:hover {
  background-color: #c0392b;
}
</style>
</head>
<body>
${Main}<br/><br/>完全开源、免费且禁止商用<br/><br/>点击复制反向代理: <a href="v1" onclick="copyLink(event)">Copy Link</a><br/>填入OpenAI API反向代理并选择OpenAI分类中的claude模型（酒馆需打开Show "External" models，仅在api模式有模型选择差异）<br/><br/><a href="/cookie-manager" class="manage-link">Cookie管理页面</a> <span class="restart-btn" onclick="restartServer()">重启服务器</span><br/><br/>教程与FAQ: <a href="https://rentry.org/teralomaniac_clewd" target="FAQ">Rentry</a> | <a href="https://discord.com/invite/B7Wr25Z7BZ" target="FAQ">Discord</a><br/><br/><br/>❗警惕任何高风险cookie/伪api(25k cookie)购买服务，以及破坏中文AI开源共享环境倒卖免费资源抹去署名的群组（🈲黑名单：酒馆小二、AI新服务、浅睡(鲑鱼)、赛博女友制作人(青麈/overloaded/科普晓百生)🈲）
</body>
</html>`); //
        res.end(); //res.json(//    {//    error: {//        message: '404 Not Found',//        type: 404,//        param: null,//        code: 404//    }//}, 404);
    }
}));

!async function() {
    await (async () => {
        if (exists(ConfigPath)) {
            const userConfig = require(ConfigPath), validConfigs = Object.keys(Config), parsedConfigs = Object.keys(userConfig), parsedSettings = Object.keys(userConfig.Settings), invalidConfigs = parsedConfigs.filter((config => !validConfigs.includes(config))), validSettings = Object.keys(Config.Settings);
            UnknownSettings = parsedSettings.filter((setting => !validSettings.includes(setting)));
            invalidConfigs.forEach((config => {
                console.warn(`unknown config in config.js: [33m${config}[0m`);
            }));
            UnknownSettings.forEach((setting => {
                console.warn(`unknown setting in config.js: [33mSettings.${setting}[0m`);
            }));
            const missingConfigs = validConfigs.filter((config => !parsedConfigs.includes(config))), missingSettings = validSettings.filter((config => !parsedSettings.includes(config)));
            missingConfigs.forEach((config => {
                console.warn(`adding missing config in config.js: [33m${config}[0m`);
                userConfig[config] = Config[config];
            }));
            missingSettings.forEach((setting => {
                console.warn(`adding missing setting in config.js: [33mSettings.${setting}[0m`);
                userConfig.Settings[setting] = Config.Settings[setting];
            }));
            ChangedSettings = parsedSettings.filter((setting => Config.Settings[setting] !== userConfig.Settings[setting]));
            (missingConfigs.length > 0 || missingSettings.length > 0) && await writeSettings(userConfig);
            userConfig.Settings.LogMessages && (Logger = createWriteStream(LogPath));
            Config = {
                ...Config,
                ...userConfig
            };
        } else {
            Config.Cookie = 'SET YOUR COOKIE HERE';
            writeSettings(Config, true);
        }
    })();
/***************************** */
    for (let key in Config) {
        if (key === 'Settings') {
            for (let setting in Config.Settings) {
                Config.Settings[setting] = process.env[setting] ? convertToType(process.env[setting]) : Config.Settings[setting];
            }
        } else {
            Config[key] = process.env[key] ? convertToType(process.env[key]) : Config[key];
        }
    }
    Config.rProxy = Config.rProxy.replace(/\/$/, '');
    Config.CookieArray = [...new Set([Config.CookieArray].join(',').match(/(claude[-_][a-z0-9-_]*?@)?(sessionKey=)?sk-ant-sid01-[\w-]{86}-[\w-]{6}AA/g))];
    Config.unknownModels = Config.unknownModels.reduce((prev, cur) => !cur || prev.includes(cur) || AI.mdl().includes(cur) ? prev : [...prev, cur], []);
    writeSettings(Config);
    currentIndex = Config.CookieIndex > 0 ? Config.CookieIndex - 1 : Config.Cookiecounter >= 0 ? Math.floor(Math.random() * Config.CookieArray.length) : 0;
/***************************** */
    Proxy.listen(Config.Port, Config.Ip, onListen);
    Proxy.on('error', (err => {
        console.error('Proxy error\n%o', err);
    }));
}();

const cleanup = async () => {
    console.log('cleaning...');
    try {
        await deleteChat(Conversation.uuid);
        SuperfetchFoldersRm();
        Logger?.close();
    } catch (err) {}
    process.exit();
};

process.on('SIGHUP', cleanup);

process.on('SIGTERM', cleanup);

process.on('SIGINT', cleanup);

process.on('exit', (async () => {
    console.log('exiting...');
}));