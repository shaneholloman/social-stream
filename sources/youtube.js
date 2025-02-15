(function () {

	var urlParams = new URLSearchParams(window.location.search);
	//var channelName = "";
	var isExtensionOn = true;
	var videoId = urlParams.get("v") || false;
	try {
		if (!videoId){
			const parentUrl = window.top.location.href;
			const parentStudioMatch = parentUrl.match(/\/video\/([^\/]+)/);
			if (parentStudioMatch) {
				videoId = parentStudioMatch[1];
			}
		}
	} catch(e){}

 	function getTranslation(key, value = false) {
		if (settings.translation && settings.translation.innerHTML && key in settings.translation.innerHTML) {
			// these are the proper translations
			return settings.translation.innerHTML[key];
		} else if (settings.translation && settings.translation.miscellaneous && settings.translation.miscellaneous && key in settings.translation.miscellaneous) {
			return settings.translation.miscellaneous[key];
		} else if (value !== false) {
			return value;
		} else {
			return key.replaceAll("-", " "); //
		}
	}

	function escapeHtml(unsafe) {
		try {
			if (settings.textonlymode) {
				return unsafe;
			}
			return unsafe.replace(/[&<>"']/g, function(m) {
				return {
					'&': '&amp;',
					'<': '&lt;',
					'>': '&gt;',
					'"': '&quot;',
					"'": '&#039;'
				}[m];
			}) || "";
		} catch (e) {
			return "";
		}
	}

	function setupDeletionObserver(target) {
	  const deletionObserver = new MutationObserver((mutations) => {
		mutations.forEach((mutation) => {
		  if (mutation.type === 'attributes' && mutation.attributeName === 'is-deleted') {
			deleteThis(mutation.target);
		  }
		});
	  });

	  deletionObserver.observe(target, {
		attributes: true,
		attributeFilter: ['is-deleted'],
		subtree: true
	  });
	}
	
	function deleteThis(ele) {
	  if (ele.deleted) return;
	  ele.deleted = true;
	  try {
		const chatname = ele.querySelector("#author-name");
		if (chatname) {
		  const data = {
			chatname: escapeHtml(chatname.innerText),
			type: (youtubeShorts ? "youtubeshorts" : "youtube")
		  };
		  chrome.runtime.sendMessage(chrome.runtime.id, { "delete": data }, function(e) {});
		}
	  } catch (e) {
		console.error("Error in deleteThis:", e);
	  }
	}

	const messageHistory = new Set();
	const avatarHistory = new Map();
	
	function cloneSvgWithResolvedUse(svgElement) {
		const clonedSvg = svgElement.cloneNode(true);

		const useElements = clonedSvg.querySelectorAll("use");
		useElements.forEach(use => {
			const refId = use.getAttribute("href") || use.getAttribute("xlink:href");
			if (refId) {
				const id = refId.startsWith("#") ? refId.slice(1) : refId;
				const referencedElement = document.getElementById(id);
				if (referencedElement) {
					const clonedReferencedElement = referencedElement.cloneNode(true);
					use.parentNode.replaceChild(clonedReferencedElement, use);
				}
			}
		});

		return clonedSvg;
	}
	
	function replaceEmotesWithImages(text) {
		if (!EMOTELIST) {
			return text;
		}
		
		return text.replace(/(?<=^|\s)(\S+?)(?=$|\s)/g, (match, emoteMatch) => {
			const emote = EMOTELIST[emoteMatch];
			if (emote) {
				const escapedMatch = escapeHtml(emoteMatch);
				const isZeroWidth = typeof emote !== "string" && emote.zw;
				return `<img src="${typeof emote === 'string' ? emote : emote.url}" alt="${escapedMatch}" title="${escapedMatch}" class="${isZeroWidth ? 'zero-width-emote-centered' : 'regular-emote'}"/>`;
			}
			return match;
		});
	}
	
	function isEmoji(char) {
		const emojiRegex = /(\p{Emoji_Presentation}|\p{Extended_Pictographic})/u;
		return emojiRegex.test(char);
	}
	
	const policy = trustedTypes.createPolicy("myTrustedPolicy", {
	  createHTML: (string) => string
	});

	function getAllContentNodes(element) {
		let result = '';
		let pendingRegularEmote = null;
		let pendingSpace = "";

		function processNode(node) {
			if (node.nodeType === 3 && node.textContent.length > 0) {
				// Text node
				if (settings.textonlymode){
					result += node.textContent;
					return;
				}
				if (!EMOTELIST){
					if (pendingRegularEmote && node.textContent.trim()) {
						result += pendingRegularEmote;
						pendingRegularEmote = null;
						
					}
					if (pendingSpace){
						result += pendingSpace;
						pendingSpace = null;
					} 
					pendingSpace = escapeHtml(node.textContent);
					return;
				}
				const processedText = replaceEmotesWithImages(escapeHtml(node.textContent)); 
				const tempDiv = document.createElement('div');
				tempDiv.innerHTML = policy.createHTML(processedText);
				
				Array.from(tempDiv.childNodes).forEach(child => {
					if (child.nodeType === 3) {
						
						if (pendingRegularEmote && child.textContent.trim()) {
							result += pendingRegularEmote;
							pendingRegularEmote = null;
						}
						
						if (pendingSpace){
							result += pendingSpace;
							pendingSpace = null;
						} 
						pendingSpace = escapeHtml(child.textContent);
						
					} else if (child.nodeName === 'IMG') {
						processEmote(child);
					}
				});
			} else if (node.nodeType === 1) {
				// Element node
				if (node.nodeName === "IMG") {
					processEmote(node);
				} else if (!settings.textonlymode && node.href && (node.nodeName === "A")) {
					
					if (pendingSpace){
						result += pendingSpace;
						pendingSpace = null;
					} 
					pendingSpace = " <a href='"+node.href+"' target='_blank'>"+escapeHtml(node.textContent)+"</a> ";
					
				} else if (node.nodeName.toLowerCase() === "svg" && node.classList.contains("seventv-chat-emote")) {
					if (settings.textonlymode){
						return;
					}
					const resolvedSvg = cloneSvgWithResolvedUse(node);
					resolvedSvg.style = "";
					result += resolvedSvg.outerHTML;
				} else if (node.childNodes.length) {
					Array.from(node.childNodes).forEach(processNode);
				} else if (!settings.textonlymode && (node.nodeName.toLowerCase() === "svg")){
					result += node.outerHTML;
				}
			}
		}

		function processEmote(emoteNode) {
			if (settings.textonlymode){
				if (emoteNode.alt && isEmoji(emoteNode.alt)){
					result += escapeHtml(emoteNode.alt);
				}
				return;
			}
			const isZeroWidth = emoteNode.classList.contains("zero-width-emote") || 
								emoteNode.classList.contains("zero-width-emote-centered");
								
			if (isZeroWidth && pendingRegularEmote) {
				result += `<span class="emote-container">${pendingRegularEmote}${emoteNode.outerHTML}</span>`;
				pendingRegularEmote = null;
				if (pendingSpace){
					result += pendingSpace;
					pendingSpace = null;
				}
			} else if (!isZeroWidth) {
				if (pendingRegularEmote) {
					result += pendingRegularEmote;
					pendingRegularEmote = null;
				}
				if (pendingSpace){
					result += pendingSpace;
					pendingSpace = null;
				}
				
				let newImgAttributes = 'class="regular-emote"';
				if (emoteNode.src) {
					newImgAttributes += ` src="${emoteNode.src.replace('/1.0', '/2.0')}"`;
				}
				if (emoteNode.srcset) {
					let newSrcset = emoteNode.srcset.replace(/^[^,]+,\s*/, ''); // remove first low-res srcset.
					if (newSrcset) {
						newImgAttributes += ` srcset="${newSrcset}"`;
					}
				}
				
				pendingRegularEmote = `<img ${newImgAttributes}>`;
			} else {
				if (pendingSpace){
					result += pendingSpace;
					pendingSpace = null;
				}
				emoteNode.classList.add("regular-emote");
				result += emoteNode.outerHTML;
			}
		}

		processNode(element);

		if (pendingRegularEmote) {
			result += pendingRegularEmote;
		}
		if (pendingSpace){
			result += pendingSpace;
		}

		return result;
	}
	
	
	function deepMerge(target, source) {
	  for (let key in source) {
		if (source.hasOwnProperty(key)) {
		  if (typeof source[key] === 'object' && source[key] !== null) {
			target[key] = target[key] || {};
			deepMerge(target[key], source[key]);
		  } else {
			target[key] = source[key];
		  }
		}
	  }
	  return target;
	}

	var EMOTELIST = false;
	function mergeEmotes(){ // BTTV takes priority over 7TV in this all.
		
		EMOTELIST = {};
		
		if (BTTV) {
			//console.log(BTTV);
			if (settings.bttv) {
				try {
					if (BTTV.channelEmotes) {
						EMOTELIST = BTTV.channelEmotes;
					}
					if (BTTV.sharedEmotes) {
						EMOTELIST = deepMerge(BTTV.sharedEmotes, EMOTELIST);
					}
					if (BTTV.globalEmotes) {
						EMOTELIST = deepMerge(BTTV.globalEmotes, EMOTELIST);
					}
				} catch (e) {console.warn(e);}
			}
		}
		if (SEVENTV) {
			//console.log(SEVENTV);
			if (settings.seventv) {
				try {
					if (SEVENTV.channelEmotes) {
						EMOTELIST = deepMerge(SEVENTV.channelEmotes, EMOTELIST);
					}
				} catch (e) {}
				try {
					if (SEVENTV.globalEmotes) {
						EMOTELIST = deepMerge(SEVENTV.globalEmotes, EMOTELIST);
					}
				} catch (e) {}
			}
		}
		if (FFZ) {
			//console.log(FFZ);
			if (settings.ffz) {
				try {
					if (FFZ.channelEmotes) {
						EMOTELIST = deepMerge(FFZ.channelEmotes, EMOTELIST);
					}
				} catch (e) {}
				try {
					if (FFZ.globalEmotes) {
						EMOTELIST = deepMerge(FFZ.globalEmotes, EMOTELIST);
					}
				} catch (e) {}
			}
		}
		
		// for testing.
 		//EMOTELIST = deepMerge({
		//	 "ASSEMBLE0":{url:"https://cdn.7tv.app/emote/641f651b04bb57ba4db57e1d/2x.webp","zw":true},
		//	 "oEDM": {url:"https://cdn.7tv.app/emote/62127910041f77b2480365f4/2x.webp","zw":true},
		//	 "widepeepoHappy": "https://cdn.7tv.app/emote/634493ce05c2b2cd864d5f0d/2x.webp"
		// }, EMOTELIST);
		//console.log(EMOTELIST);
	}

	function extractYouTubeRedirectUrl(youtubeUrl) {
		const url = new URL(youtubeUrl);
		if (url.hostname === "www.youtube.com" && url.pathname === "/redirect") {
			const actualUrl = url.searchParams.get("q");
			if (actualUrl) {
				return actualUrl.replace(/\&/g, "&amp;");
			} else {
				return youtubeUrl;
			}
		} else {
			return youtubeUrl;
		}
	}

	function getAllContentNodes2(element) {
		var resp = "";
		element.childNodes.forEach(node => {
			if (node.childNodes.length) {
				resp += getAllContentNodes(node);
			} else if (node.nodeType === 3) {
				resp += escapeHtml(node.textContent);
			} else if (node.nodeType === 1) {
				if (node.nodeName === "IMG" && node.src) {
					resp += `<img src="${node.src}">`;
				} else {
					resp += node.outerHTML;
				}
			}
		});
		return resp;
	}


	function findSingleInteger(input) {
		// Ensure the input is a string
		const str = String(input);

		const matches = str.match(/\d+/g);
		if (matches && matches.length === 1) {
			return parseInt(matches[0], 10);
		} else {
			return false;
		}
	}
	
	function isHTMLElement(variable) {
	  return variable instanceof HTMLElement || variable instanceof Node;
	}

	function isObject(variable) {
	  return typeof variable === 'object' && variable !== null && !isHTMLElement(variable);
	}
	
	function delay(ms) {
	  return new Promise(resolve => setTimeout(resolve, ms));
	}

	async function processMessage(ele, wss = true, eventType=false) {
		console.log(ele);
		if (!ele || !ele.isConnected){
			return;
		}
		if (ele.hasAttribute("is-deleted")) {
			deleteThis(ele)
			return;
		}
		if (settings.customyoutubestate) {
			return;
		}
		try {
			if (ele.skip) {
				return;
			} else if (ele.id) {
				if (messageHistory.has(ele.id)) return;
				messageHistory.add(ele.id);
				if (messageHistory.size > 300) { // 250 seems to be Youtube's max?
				    const iterator = messageHistory.values();
				    messageHistory.delete(iterator.next().value);	  
				}
				if (ele.id.length<40){
					setTimeout(()=>{
						if (ele.id.length<40){
							setTimeout(()=>{
								if (ele.id.length<40){
									setTimeout(()=>{
										messageHistory.add(ele.id);
									},2000);
								} else {
									messageHistory.add(ele.id);
								}
							},2000);
						} else {
							messageHistory.add(ele.id);
						}
					},2000);
				}
				//console.log(messageHistory);
		    } else {
				return; // no id.
		    }
			if (ele.querySelector("[in-banner]")) {
				//console.log("Message in-banner");
				return;
			}
		} catch (e) {}

		ele.skip = true;
		
		//if (channelName && settings.customyoutubestate){
		//if (settings.customyoutubeaccount && settings.customyoutubeaccount.textsetting && (settings.customyoutubeaccount.textsetting.toLowerCase() !== channelName.toLowerCase())){
		//	return;
		//} else if (!settings.customyoutubeaccount){
		//	return;
		//}
		//  }
		
		
		//<yt-live-chat-text-message-renderer class="style-scope yt-live-chat-item-list-renderer" modern="" enable-refresh-web="" id="ChwKGkNObVM1cUhZdjRvREZRRFpGZ2tkMUxFREln" whole-message-clickable="{&quot;commandMetadata&quot;:{&quot;webCommandMetadata&quot;:{&quot;ignoreNavigation&quot;:true}},&quot;liveChatItemContextMenuEndpoint&quot;:{&quot;params&quot;:&quot;Q2g0S0hBb2FRMDV0VXpWeFNGbDJORzlFUmxGRVdrWm5hMlF4VEVWRVNXY2FLU29uQ2hoVlEwdHViMlJJU25CYVpEaFZZbE4yUVhWbVJHUXpYMmNTQzNadmVIVlNibVZLWTB0UklBSW9BVElhQ2hoVlEyMXhWaTFvTld3MFZtRXRZWE00TXpOemFqbExNVkU0QWtnQVVBRSUzRA==&quot;}}" author-type="moderator"><!--css-build:shady--><!--css-build:shady--><yt-img-shadow id="author-photo" class="no-transition style-scope yt-live-chat-text-message-renderer" height="24" width="24" style="background-color: transparent;" loaded=""><!--css-build:shady--><!--css-build:shady--><img id="img" draggable="false" class="style-scope yt-img-shadow" alt="" height="24" width="24" src="https://yt4.ggpht.com/aKvMhfJ7bDJsUN1e1x4jQzhAQwJTtyOqKurlxOEvajrzPp8sJcFrZyLnSNysNUEnaGYwR1CWtw=s32-c-k-c0x00ffffff-no-rj"></yt-img-shadow><div id="content" class="style-scope yt-live-chat-text-message-renderer"><span id="timestamp" class="style-scope yt-live-chat-text-message-renderer">12:38 AM</span><yt-live-chat-author-chip class="style-scope yt-live-chat-text-message-renderer"><!--css-build:shady--><!--css-build:shady--><span id="prepend-chat-badges" class="style-scope yt-live-chat-author-chip"></span><span id="author-name" dir="auto" class="moderator style-scope yt-live-chat-author-chip style-scope yt-live-chat-author-chip">Stephanie Warfield<span id="chip-badges" class="style-scope yt-live-chat-author-chip"></span></span><span id="chat-badges" class="style-scope yt-live-chat-author-chip"><yt-live-chat-author-badge-renderer class="style-scope yt-live-chat-author-chip" aria-label="Moderator" type="moderator" shared-tooltip-text="Moderator"><!--css-build:shady--><!--css-build:shady--><div id="image" class="style-scope yt-live-chat-author-badge-renderer"><yt-icon class="style-scope yt-live-chat-author-badge-renderer"><!--css-build:shady--><!--css-build:shady--><span class="yt-icon-shape style-scope yt-icon yt-spec-icon-shape"><div style="width: 100%; height: 100%; display: block; fill: currentcolor;"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" focusable="false" aria-hidden="true" style="pointer-events: none; display: inherit; width: 100%; height: 100%; fill: rgb(94, 132, 241);"><path d="M9.64589146,7.05569719 C9.83346524,6.562372 9.93617022,6.02722257 9.93617022,5.46808511 C9.93617022,3.00042984 7.93574038,1 5.46808511,1 C4.90894765,1 4.37379823,1.10270499 3.88047304,1.29027875 L6.95744681,4.36725249 L4.36725255,6.95744681 L1.29027875,3.88047305 C1.10270498,4.37379824 1,4.90894766 1,5.46808511 C1,7.93574038 3.00042984,9.93617022 5.46808511,9.93617022 C6.02722256,9.93617022 6.56237198,9.83346524 7.05569716,9.64589147 L12.4098057,15 L15,12.4098057 L9.64589146,7.05569719 Z"></path></svg></div></span></yt-icon></div></yt-live-chat-author-badge-renderer><yt-live-chat-author-badge-renderer class="style-scope yt-live-chat-author-chip" aria-label="New member" type="member" shared-tooltip-text="New member"><!--css-build:shady--><!--css-build:shady--><div id="image" class="style-scope yt-live-chat-author-badge-renderer"><img src="https://yt3.ggpht.com/7_W1_is17mb5tlSPcOpd-t40Jqrk2tdSzCKPKE5nfmWKNaoK7lx0r7bnf2t5CVqbDgDosT3s=s32-c-k" class="style-scope yt-live-chat-author-badge-renderer" alt="New member"></div></yt-live-chat-author-badge-renderer></span></yt-live-chat-author-chip>&ZeroWidthSpace;<div id="before-content-buttons" class="style-scope yt-live-chat-text-message-renderer"></div>&ZeroWidthSpace;<span id="message" dir="auto" class="style-scope yt-live-chat-text-message-renderer">ewww <img class="small-emoji emoji yt-formatted-string style-scope yt-live-chat-text-message-renderer" src="https://fonts.gstatic.com/s/e/notoemoji/15.1/1f92e/72.png" alt="🤮" shared-tooltip-text=":face_vomiting:" id="emoji-132"><img class="small-emoji emoji yt-formatted-string style-scope yt-live-chat-text-message-renderer" src="https://fonts.gstatic.com/s/e/notoemoji/15.1/1f922/72.png" alt="🤢" shared-tooltip-text=":nauseated_face:" id="emoji-133"></span><span id="deleted-state" class="style-scope yt-live-chat-text-message-renderer"></span><a id="show-original" href="#" class="style-scope yt-live-chat-text-message-renderer"></a></div><div id="menu" class="style-scope yt-live-chat-text-message-renderer"><yt-icon-button id="menu-button" class="style-scope yt-live-chat-text-message-renderer" role="button" aria-label="yt-icon-button"><!--css-build:shady--><!--css-build:shady--><button id="button" class="style-scope yt-icon-button" aria-label="Chat actions"><yt-icon icon="more_vert" class="style-scope yt-live-chat-text-message-renderer"><!--css-build:shady--><!--css-build:shady--><span class="yt-icon-shape style-scope yt-icon yt-spec-icon-shape"><div style="width: 100%; height: 100%; display: block; fill: currentcolor;"><svg xmlns="http://www.w3.org/2000/svg" enable-background="new 0 0 24 24" height="24" viewBox="0 0 24 24" width="24" focusable="false" aria-hidden="true" style="pointer-events: none; display: inherit; width: 100%; height: 100%;"><path d="M12 16.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5-1.5-.67-1.5-1.5.67-1.5 1.5-1.5zM10.5 12c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5-.67-1.5-1.5-1.5-1.5.67-1.5 1.5zm0-6c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5-.67-1.5-1.5-1.5-1.5.67-1.5 1.5z"></path></svg></div></span></yt-icon></button><yt-interaction id="interaction" class="circular style-scope yt-icon-button"><!--css-build:shady--><!--css-build:shady--><div class="stroke style-scope yt-interaction"></div><div class="fill style-scope yt-interaction"></div></yt-interaction></yt-icon-button></div><div id="inline-action-button-container" class="style-scope yt-live-chat-text-message-renderer" aria-hidden="true"><div id="inline-action-buttons" class="style-scope yt-live-chat-text-message-renderer"></div></div></yt-live-chat-text-message-renderer>

		var chatmessage = "";
		var chatname = "";
		var chatimg = "";
		var nameColor = "";
		var member = false;
		var mod = false;
		
		var donoValue = "";

		var srcImg = ""; // what shows up as the source image; blank is default (dock decides).

		try {
			var nameElement = ele.querySelector("#author-name");
			chatname = escapeHtml(nameElement.innerText);
			if (!chatname){
				return;
			}
			
			ele.querySelectorAll('yt-live-chat-author-badge-renderer[type]').forEach(type=>{
				if (type.getAttribute("type")=="mod"){
					mod=true;
				} else if (type.getAttribute("type")=="member"){
					member=true;
				}
			});

			if (!settings.nosubcolor) {
				if (mod || nameElement.classList.contains("moderator")) {
					nameColor = "#5e84f1";
					mod = true;
				} else if (member || nameElement.classList.contains("member")) {
					nameColor = "#107516";
					member = true;
				} 
			}
			
		} catch (e) {}

		try {
			var BTT = ele.querySelectorAll(".bttv-tooltip");
			for (var i = 0; i < BTT.length; i++) {
				BTT[i].outerHTML = "";
			}
		} catch (e) {}

		if (!settings.textonlymode) {
			try {
				chatmessage = getAllContentNodes(ele.querySelector("#message, .seventv-yt-message-content"));
			} catch (e) {
				//console.warn(ele);
				//console.error(e);
			}
		} else {
			try {
				var cloned = ele.querySelector("#message, .seventv-yt-message-content").cloneNode(true);
				//var children = cloned.querySelectorAll("[alt]");
				//for (var i =0;i<children.length;i++){
				//	children[i].outerHTML = children[i].alt;
				//}
				var children = cloned.querySelectorAll('[role="tooltip"]');
				for (var i = 0; i < children.length; i++) {
					children[i].outerHTML = "";
				}
				chatmessage = getAllContentNodes(cloned);
			} catch (e) {
				//console.error(e);
			}
		}


		
		// https://yt3.ggpht.com/y0njK_GOHV6k7ZlW4qQbVxTt3z3Hs1eXBi2LeYJ-7hFT7KWXXKvcsl0FhYMWsHJh2VEoQvZrsko=w48-h48-c-k-nd

		try {
			chatimg = ele.querySelector("#img[src], #author-photo img[src]").src;
			if (chatimg.startsWith("data:image/gif;base64")) { 
				await delay(500);//console.log(ele);
				chatimg = document.querySelector("#"+ele.id+" #author-photo img[src]:not([src^='data:image/gif;base64'])") || "";
				if (chatimg){
					chatimg = chatimg.src;
				}
			}
		} catch (e) {
			//console.log(e);
			chatimg = "";
		}
		
		if (chatimg){
			chatimg = chatimg.replace("=s32-", "=s64-"); 
			avatarHistory.set(chatname, chatimg);
		} else {
			chatimg = avatarHistory.get(chatname) || "";
			// console.log("no image..", chatimg);
		}

		var chatdonation = "";
		try {
			chatdonation = escapeHtml(ele.querySelector("#purchase-amount").innerText);
		} catch (e) {}

		var chatmembership = "";
		try {
			chatmembership = ele.querySelector(".yt-live-chat-membership-item-renderer #header-subtext").innerHTML;
			member = true;
		} catch (e) {}
		
		var treatAsMemberChat = false;
		if (settings.allmemberchat && member) {
			treatAsMemberChat = true;
		} else if (chatmembership) {
			treatAsMemberChat = true;
		}
		
		var chatsticker = "";
		try {
			chatsticker = ele.querySelector(".yt-live-chat-paid-sticker-renderer #sticker>#img[src]").src;
		} catch (e) {}

		if (chatsticker) {
			try {
				chatdonation = escapeHtml(ele.querySelector("#purchase-amount-chip").innerText);
			} catch (e) {}
		}

		var chatbadges = [];
		try {
			ele.querySelectorAll(".yt-live-chat-author-badge-renderer img, .yt-live-chat-author-badge-renderer svg").forEach(img => {
				if (img.tagName.toLowerCase() == "img") {
					var html = {};
					
					let badgesrc = img.src.trim();
					badgesrc = badgesrc.replaceAll("=w16-h16-", "=w48-h48-"); // increases the resolution of emojis
					badgesrc = badgesrc.replaceAll("=w24-h24-", "=w64-h64-");
					badgesrc = badgesrc.replaceAll("=s16-", "=s48-");
					badgesrc = badgesrc.replaceAll("=s24-", "=s48-");
					
					html.src = badgesrc;
					html.type = "img";
					chatbadges.push(html);
				} else if (img.tagName.toLowerCase() == "svg") {
					var html = {};
					img.style.fill = window.getComputedStyle(img).color;
					html.html = img.outerHTML;
					html.type = "svg";
					chatbadges.push(html);
				}
			});
		} catch (e) {}

		var hasDonation = "";
		if (chatdonation) {
			hasDonation = chatdonation;
		}

		var hasMembership = "";

		var subtitle = "";

		var giftedmemembership = ele.querySelector("#primary-text.ytd-sponsorships-live-chat-header-renderer");

		if (treatAsMemberChat) {
			if (chatmessage) {
				//if (mod) {
				//	hasMembership = chatmembership || getTranslation("moderator-chat", "MODERATOR");
				//} else {
				hasMembership = chatmembership || getTranslation("member-chat", "MEMBERSHIP");
				//}
				var membershipLength = ele.querySelector("#header-subtext.yt-live-chat-membership-item-renderer, #header-primary-text.yt-live-chat-membership-item-renderer") || false;
				if (membershipLength) {
					membershipLength = getAllContentNodes(membershipLength);
					membershipLength = findSingleInteger(membershipLength);
				}
				if (membershipLength) {
					if (membershipLength == 1) {
						subtitle = membershipLength + " " + getTranslation("month", "month");
					} else {
						subtitle = membershipLength + " " + getTranslation("months", "months");
					}
				}
			} else if (giftedmemembership) {
				hasMembership = getTranslation("sponsorship", "SPONSORSHIP");
				chatmessage = getAllContentNodes(giftedmemembership);
				eventType = "sponsorship";
			} else {
				hasMembership = getTranslation("new-member", "NEW MEMBER");
				eventType = "newmember";
				
				if (chatmembership){
					chatmessage =  chatmembership;
				} else {
					chatmessage = getTranslation("new-membership", "Joined as a member");
				}
			}

			if (!hasMembership) {
				if (member) {
					hasMembership = getTranslation("member-chat", "MEMBERSHIP");
				} //else if (mod) {
				//	hasMembership = getTranslation("moderator-chat", "MODERATOR");
				//}
			}
		} else if (!chatmessage && giftedmemembership) {
			eventType = "sponsorship";
			chatmessage = getAllContentNodes(giftedmemembership);
			hasMembership = getTranslation("sponsorship", "SPONSORSHIP");
		}
		
		
		if (settings.memberchatonly && !hasMembership){
			return;
		}

		if (giftedmemembership && !hasDonation) {
			try {
				const match = giftedmemembership.innerText.match(/\b\d+\b/);
				hasDonation = match ? parseInt(match[0], 10) : null;
				if (hasDonation) {
					donoValue = 5*hasDonation;
					if (hasDonation==1){
						hasDonation += " " + getTranslation("gifted-membership", "Gifted");
					} else {
						hasDonation += " " + getTranslation("gifted-memberships", "Gifted");
					}
					
				}
			} catch (e) {
				hasDonation = "";
			}
		}
		
		if (chatsticker) {
			if (!settings.textonlymode) {
				chatmessage = '<img class="supersticker" src="' + chatsticker + '">';
			}
		}

		var backgroundColor = "";

		var textColor = "";
		if (ele.style.getPropertyValue("--yt-live-chat-paid-message-primary-color")) {
			backgroundColor = ele.style.getPropertyValue("--yt-live-chat-paid-message-primary-color");
			textColor = "#111;";
		}

		if (ele.style.getPropertyValue("--yt-live-chat-sponsor-color")) {
			backgroundColor = ele.style.getPropertyValue("--yt-live-chat-sponsor-color");
			textColor = "#111;";
		}

		srcImg = document.querySelector("#input-panel");
		if (srcImg) {
			srcImg = srcImg.querySelector("#img[src]");
			if (srcImg) {
				srcImg = srcImg.src || "";
			} else {
				srcImg = "";
			}
		} else {
			srcImg = "";
		}

		if (!chatmessage && !hasDonation) {
			//console.error("No message or donation");
			return;
		}
		
		chatmessage = chatmessage.trim();
		chatmessage = chatmessage.replaceAll("=w16-h16-", "=w48-h48-"); // increases the resolution of emojis
		chatmessage = chatmessage.replaceAll("=w24-h24-", "=w64-h64-");
		chatmessage = chatmessage.replaceAll("=s16-", "=s48-");
		chatmessage = chatmessage.replaceAll("=s24-", "=s48-");
		
		if (isHTMLElement(chatmessage)){
			//console.error(chatmessage);
			chatmessage = escapeHtml(chatmessage.textContent.trim());
		} else if (isObject(chatmessage)){
			//console.error(chatmessage);
			chatmessage = "";
		}
		

		

		var data = {};
		data.chatname = chatname;
		data.nameColor = nameColor;
		data.chatbadges = chatbadges;
		data.backgroundColor = backgroundColor;
		data.textColor = textColor;
		data.chatmessage = chatmessage;
		data.chatimg = chatimg;
		data.hasDonation = hasDonation;
		if (donoValue){
			data.donoValue = donoValue;
		}
		data.membership = hasMembership;
		if (mod){
			data.mod = mod;
		}
		data.subtitle = subtitle;
		if (videoId){
			data.videoid = videoId;
		}
		data.textonly = settings.textonlymode || false;
		data.type = "youtube"; 
		
		if (youtubeShorts){
			data.type = "youtubeshorts";
		}
		
		if (data.hasDonation){
			data.title = getTranslation("donation", "DONATION");
			if (!data.chatmessage){
				data.chatmessage = getTranslation("thank-you", "Thank you for your donation!");
				if (!data.event){
					data.event = "thankyou";
				}
			}
		}
		
		data.event = eventType;
		
		//if (eventType){
		//	console.log(data);
		//}

		try {
			chrome.runtime.sendMessage(
				chrome.runtime.id,
				{
					message: data
				},
				function () {}
			);
		} catch (e) {}
	}
	var settings = {};
	var BTTV = false;
	var videosMuted = false;
	var SEVENTV = false;
	var FFZ = false;
	
	function containsShorts(url) {
		const urlObj = new URL(url);
		const searchParams = new URLSearchParams(urlObj.search);
		const hasShortsParam = searchParams.has('shorts');
		const hasShortsPath = urlObj.pathname.includes('/shorts');
		return hasShortsParam || hasShortsPath;
	}
	
	var youtubeShorts = false;
	if (containsShorts(window.location.href)){
		youtubeShorts = true;
	}
	
	chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
		try {
			if ("focusChat" == request) {
				document.querySelector("div#input").focus();
				simulateFocus(document.querySelector("div#input"));
				sendResponse(true);
				return;
			}
			if (typeof request === "object") {
				
				if ("state" in request) {
					isExtensionOn = request.state;
				}
				
				if ("settings" in request) {
					settings = request.settings;
					sendResponse(true);
					if (settings.bttv) {
						chrome.runtime.sendMessage(chrome.runtime.id, { getBTTV: true }, function (response) {});
					}
					if (settings.seventv) {
						chrome.runtime.sendMessage(chrome.runtime.id, { getSEVENTV: true }, function (response) {});
					}
					if (settings.ffz) {
						chrome.runtime.sendMessage(chrome.runtime.id, { getFFZ: true }, function (response) {});
					}
					if (settings.delayyoutube){
						captureDelay = 3200;
						//console.log(captureDelay);
					} else {
						captureDelay = 200;
						//console.log(captureDelay);
					}
					return;
				}
				if ("SEVENTV" in request) {
					SEVENTV = request.SEVENTV;
					//console.log(SEVENTV);
					sendResponse(true);
					mergeEmotes();
					return;
				}
				if ("BTTV" in request) {
					BTTV = request.BTTV;
					//console.log(BTTV);
					sendResponse(true);
					mergeEmotes();
					return;
				}
				if ("FFZ" in request) {
					FFZ = request.FFZ;
					//console.log(FFZ);
					sendResponse(true);
					mergeEmotes();
					return;
				}

				if ("muteWindow" in request) {
					if (request.muteWindow) {
						clearInterval(videosMuted);
						videosMuted = setInterval(function () {
							document.querySelectorAll("video").forEach(v => {
								v.muted = true;
								v.pause();
							});
						}, 1000);
						document.querySelectorAll("video").forEach(v => {
							v.muted = true;
							v.pause();
						});
						sendResponse(true);
						return;
					} else {
						if (videosMuted) {
							clearInterval(videosMuted);
							document.querySelectorAll("video").forEach(v => {
								v.muted = false;
								v.play();
							});
						} else {
							clearInterval(videosMuted);
						}
						videosMuted = false;
						sendResponse(true);
						return;
					}
				}
			}
		} catch (e) {}
		sendResponse(false);
	});

	var captureDelay = 200;

	chrome.runtime.sendMessage(chrome.runtime.id, { getSettings: true }, function (response) {
		// {"state":isExtensionOn,"streamID":channel, "settings":settings}
		
		if (!response){return;}
		
		if ("state" in response){
			isExtensionOn = response.state;
		}
		
		if ("settings" in response) {
			settings = response.settings;
			
			if (settings.bttv && !BTTV) {
				chrome.runtime.sendMessage(chrome.runtime.id, { getBTTV: true }, function (response) {
					//	console.log(response);
				});
			}
			if (settings.seventv && !SEVENTV) {
				chrome.runtime.sendMessage(chrome.runtime.id, { getSEVENTV: true }, function (response) {
					//	console.log(response);
				});
			}
			if (settings.ffz && !FFZ) {
				chrome.runtime.sendMessage(chrome.runtime.id, { getFFZ: true }, function (response) {
					//	console.log(response);
				});
			}
			
			if (settings.delayyoutube){
				captureDelay = 2000;
				//console.log(captureDelay);
			} else {
				captureDelay = 200;
				//console.log(captureDelay);
			}
		}
	});

	function onElementInserted(target, callback) {
		console.log(target);
		var onMutationsObserved = function (mutations) {
			mutations.forEach(function (mutation) {
				console.log(mutation.addedNodes);
				if (mutation.addedNodes.length) {
					for (var i = 0, len = mutation.addedNodes.length; i < len; i++) {
						try {
							if (mutation.addedNodes[i] && mutation.addedNodes[i].classList && mutation.addedNodes[i].classList.contains("yt-live-chat-banner-renderer")) {
								continue;
							} else if (mutation.addedNodes[i].tagName == "yt-live-chat-text-message-renderer".toUpperCase()) {
								callback(mutation.addedNodes[i]);
							} else if (mutation.addedNodes[i].tagName == "yt-live-chat-paid-message-renderer".toUpperCase()) {
								callback(mutation.addedNodes[i]);
							} else if (mutation.addedNodes[i].tagName == "yt-live-chat-membership-item-renderer".toUpperCase()) {
								callback(mutation.addedNodes[i]);
							} else if (mutation.addedNodes[i].tagName == "yt-live-chat-paid-sticker-renderer".toUpperCase()) {
								callback(mutation.addedNodes[i]);
							} else if (mutation.addedNodes[i].tagName == "ytd-sponsorships-live-chat-gift-redemption-announcement-renderer".toUpperCase()) {
								callback(mutation.addedNodes[i], "giftredemption");
							} else if (mutation.addedNodes[i].tagName == "ytd-sponsorships-live-chat-gift-purchase-announcement-renderer".toUpperCase()) {
								// ytd-sponsorships-live-chat-gift-purchase-announcement-renderer
								callback(mutation.addedNodes[i], "giftpurchase");
							} else {
								//console.error("unknown: "+mutation.addedNodes[i].tagName);
							}
						} catch (e) {}
					}
				}
			});
		};
		if (!target) {
			return;
		}
		var config = {childList: true, subtree: false};
		var MutationObserver = window.MutationObserver || window.WebKitMutationObserver;
		var observer = new MutationObserver(onMutationsObserved);
		observer.observe(target, config);
	}

	console.log("Social stream inserted");
	var marked = false;
	const checkTimer = setInterval(function () {
	  const ele = document.querySelector("yt-live-chat-app #items.yt-live-chat-item-list-renderer");
	  if (ele && !ele.skip) {
		ele.skip = true;
		setupDeletionObserver(ele);
		try {
			ele.querySelectorAll("yt-live-chat-text-message-renderer").forEach(ele4 => {
				ele4.skip = true;
				cleared = true;
				if (ele4.id) {
					messageHistory.add(ele4.id);
				}
			});
		} catch (e) {}
		onElementInserted(ele, function (ele2) {
			setTimeout(() => processMessage(ele2, false), captureDelay);
		});
	  } else if (!ele){
		 const message = document.querySelector("yt-live-chat-app yt-formatted-string.yt-live-chat-message-renderer");
		if (message && !document.getElementById("videoIdInput")) {
			message.innerText = 
				"It doesn't seem like we've been able to find any active live Youtube chat.\n\n" +
				"➡️ Your Youtube stream must be already Live, active, and public for this option to work.\n\n" +
				"Please stop and reactivate this Youtube option once your video is public and live.\n\n\n\n\n" +
				"For unlisted videos, you can use a specific video ID instead.\n\n" +
				"If you know the video ID, you can try loading it specifically below:\n\n\n";

			// Create input element
			const input = document.createElement('input');
			input.type = 'text';
			input.id = 'videoIdInput';
			input.placeholder = 'Enter video ID';
			message.parentNode.insertBefore(input, message.nextSibling);

			// Create button element
			const button = document.createElement('button');
			button.id = 'loadChatButton';
			button.textContent = 'Load Chat';
			message.parentNode.insertBefore(button, input.nextSibling);

			// Add event listener to the button
			button.addEventListener('click', () => {
				const videoId = input.value.trim();
				if (videoId) {
					window.location.href = `https://www.youtube.com/live_chat?is_popout=1&v=${videoId}`;
				} else {
					alert('Please enter a valid video ID');
				}
			});
		}
	  }
	  // style-scope yt-live-chat-message-renderer
	  
	  if (settings.autoLiveYoutube && document.querySelector("#trigger") && !marked){
			marked = true;
			document.querySelector("#trigger").click()
			document.querySelector('[slot="dropdown-content"] [tabindex="0"]').click()
			var waitTilClear = setInterval(function(){
				if (document.querySelectorAll('#menu > a').length==2){
					clearInterval(waitTilClear);
					document.querySelectorAll('#menu > a')[1].click()
					document.querySelector("yt-live-chat-header-renderer").style.maxHeight = "10px";
				}
			},100)
	  } else if (document.querySelector("#trigger") && !settings.autoLiveYoutube && marked){
		  document.querySelector("yt-live-chat-header-renderer").style.maxHeight = "unset";
		  marked = false;
	  }
	}, 1000);

	if (window.location.href.includes("youtube.com/watch")) {
		var checkTimer2 = setInterval(function () {
			try {
				if (document.querySelector("iframe[src]") && !document.querySelector("iframe[src]").src.includes("truffle.vip")) {
					var ele = document.querySelector("iframe").contentWindow.document.body.querySelector("#chat-messages #chat #contents > #item-scroller > #item-offset > #items.yt-live-chat-item-list-renderer");
				} else {
					var ele = false;
				}
			} catch (e) {}
			
			if (ele) {
				
				clearInterval(checkTimer2);
				var cleared = false;
				try {
					ele.querySelectorAll("yt-live-chat-text-message-renderer").forEach(ele4 => {
						ele4.skip = true;
						cleared = true;
						if (ele4.id) {
							messageHistory.add(ele4.id);
						}
					});
				} catch (e) {}
				
				if (cleared) {
					clearInterval(checkTimer2);
					onElementInserted(ele, function (ele2, eventType=false) {
						setTimeout(
							function (ele2,eventType) {
								processMessage(ele2, false, eventType);
							},
							captureDelay,
							ele2,
							eventType
						);
					});
				} else {
					setTimeout(function (ele) {
						// style-scope yt-live-chat-item-list-renderer
						onElementInserted(ele, function (ele2, eventType=false) {
							setTimeout(
								function (ele2,eventType) {
									processMessage(ele2, false, eventType);
								},
								captureDelay,
								ele2,
								eventType
							);
						});
					}, 1000, ele);
				
				}
			}
		}, 3000);
	}
	
	
	function checkViewers(){
		if (videoId && isExtensionOn && (settings.showviewercount || settings.hypemode)){
			fetch('https://api.socialstream.ninja/youtube/viewers?video='+videoId)
			  .then(response => response.json())
			  .then(data => {
				try {
					if (data && ("viewers" in data)){
						chrome.runtime.sendMessage(
							chrome.runtime.id,
							({message:{
									type: (youtubeShorts ? "youtubeshorts" : "youtube"),
									event: 'viewer_update',
									meta: parseInt(data.viewers)
									//chatmessage: data.data[0] + " has started following"
								}
							}),
							function (e) {}
						);
					}
				} catch (e) {
					//console.log(e);
				}
			  });
		}
	}
	
	setTimeout(function(){checkViewers();},2500);
	setInterval(function(){checkViewers()},10000);
	

	///////// the following is a loopback webrtc trick to get chrome to not throttle this tab when not visible.
	try {
		var receiveChannelCallback = function (e) {
			remoteConnection.datachannel = event.channel;
			remoteConnection.datachannel.onmessage = function (e) {};
			remoteConnection.datachannel.onopen = function (e) {};
			remoteConnection.datachannel.onclose = function (e) {};
			setInterval(function () {
				remoteConnection.datachannel.send("KEEPALIVE");
			}, 1000);
		};
		var errorHandle = function (e) {};
		var localConnection = new RTCPeerConnection();
		var remoteConnection = new RTCPeerConnection();
		localConnection.onicecandidate = e => !e.candidate || remoteConnection.addIceCandidate(e.candidate).catch(errorHandle);
		remoteConnection.onicecandidate = e => !e.candidate || localConnection.addIceCandidate(e.candidate).catch(errorHandle);
		remoteConnection.ondatachannel = receiveChannelCallback;
		localConnection.sendChannel = localConnection.createDataChannel("sendChannel");
		localConnection.sendChannel.onopen = function (e) {
			localConnection.sendChannel.send("CONNECTED");
		};
		localConnection.sendChannel.onclose = function (e) {};
		localConnection.sendChannel.onmessage = function (e) {};
		localConnection
			.createOffer()
			.then(offer => localConnection.setLocalDescription(offer))
			.then(() => remoteConnection.setRemoteDescription(localConnection.localDescription))
			.then(() => remoteConnection.createAnswer())
			.then(answer => remoteConnection.setLocalDescription(answer))
			.then(() => {
				localConnection.setRemoteDescription(remoteConnection.localDescription);
				console.log("KEEP ALIVE TRICk ENABLED");
			})
			.catch(errorHandle);
	} catch (e) {
		console.log(e);
	}
	
	function simulateFocus(element) {
		// Create and dispatch focusin event
		const focusInEvent = new FocusEvent('focusin', {
			view: window,
			bubbles: true,
			cancelable: true
		});
		element.dispatchEvent(focusInEvent);

		// Create and dispatch focus event
		const focusEvent = new FocusEvent('focus', {
			view: window,
			bubbles: false,
			cancelable: true
		});
		element.dispatchEvent(focusEvent);
	}

	
	function preventBackgroundThrottling() {
		window.onblur = null;
		window.blurred = false;
		document.hidden = false;
		document.mozHidden = false;
		document.webkitHidden = false;
		
		document.hasFocus = () => true;
		window.onFocus = () => true;

		Object.defineProperties(document, {
			mozHidden: { value: false, configurable: true },
			msHidden: { value: false, configurable: true },
			webkitHidden: { value: false, configurable: true },
			hidden: { value: false, configurable: true, writable: true },
			visibilityState: { 
				get: () => "visible",
				configurable: true
			}
		});
	}

	const events = [
		"visibilitychange",
		"webkitvisibilitychange",
		"blur",
		"mozvisibilitychange",
		"msvisibilitychange"
	];

	events.forEach(event => {
		window.addEventListener(event, (e) => {
			e.stopImmediatePropagation();
			e.preventDefault();
		}, true);
	});

	setInterval(preventBackgroundThrottling, 200);
})();