import { t, loadNamespace } from '../../lib/i18n';

/**
 * 랜덤 생성기 — 창작용 키워드·주제 뽑기
 * randomgen-topics.js에 정의된 주제를 기반으로 동작
 *
 * 참고: [니힐 랜덤 키워드](https://nihilapp.github.io/keyword) — 창작자용 랜덤 키워드 사이트
 */
(function () {
    type Topic = RandomGenTopic;
    type GenResult = { name: string; sub: string };

    const topics: Topic[] = window.RANDOMGEN_TOPICS || [];

    function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

    function generate(topic: Topic, count: number): GenResult[] {
        const results: GenResult[] = [];
        for (let i = 0; i < count; i++) {
            let name: string;
            let sub: string;
            if (topic.items) {
                name = pick(topic.items);
                sub = topic.label;
            } else if (topic.generator) {
                const r = topic.generator();
                if (typeof r === 'object' && r !== null && 'name' in r) {
                    name = r.name;
                    sub = r.sub != null ? r.sub : topic.label;
                } else {
                    name = String(r);
                    sub = topic.label;
                }
            } else {
                continue;
            }
            results.push({ name, sub });
        }
        return results;
    }

    function getGroups(): Array<{ id: string; label: string }> {
        const seen = new Set<string>();
        const groups: Array<{ id: string; label: string }> = [];
        topics.forEach(t => {
            const g = t.group || '기타';
            if (!seen.has(g)) {
                seen.add(g);
                groups.push({ id: g, label: g });
            }
        });
        return groups;
    }

    function getTopicsByGroup(): Record<string, Topic[]> {
        const byGroup: Record<string, Topic[]> = {};
        topics.forEach(t => {
            const g = t.group || '기타';
            if (!byGroup[g]) byGroup[g] = [];
            byGroup[g].push(t);
        });
        return byGroup;
    }

    function getTopicItems(topic: Topic): string[] {
        if (topic.items) return topic.items;
        if (topic.generator) {
            const samples: string[] = [];
            const seen = new Set<string>();
            for (let i = 0; i < 20 && samples.length < 10; i++) {
                const r = topic.generator();
                const name = (typeof r === 'object' && r !== null && 'name' in r) ? r.name : String(r);
                if (!seen.has(name)) { seen.add(name); samples.push(name); }
            }
            return samples;
        }
        return [];
    }

    Toolbox.register({
        ...Toolbox.getLazyWidgetPublicMeta!('randomgen'),
        tabs: [{
            id: 'app',
            label: t('randomgen.t01', undefined, "생성"),
            build: function (container: HTMLElement) {
                Mdd.linePreset('tool_run', { msg: t('randomgen.t02') });
                const esc = Toolbox.escapeHtml!;

                function buildTopicCardsHtml(): string {
                    var html = '';
                    var byGroup = getTopicsByGroup();
                    var gids = getGroups().map(function (g) { return g.id; });
                    gids.forEach(function (gid) {
                        var list = byGroup[gid] || [];
                        html += '<div class="randomgen-topic-group"><div class="randomgen-topic-group-title">' + esc(gid) + '</div><div class="randomgen-topic-cards">';
                        list.forEach(function (topic) {
                            html += '<div class="randomgen-topic-card randomgen-topic-custom" data-value="' + esc(topic.id) + '"><span class="randomgen-topic-card-label">' + esc(topic.label) + '</span><button type="button" class="randomgen-topic-info" data-topic-id="' + esc(topic.id) + t('randomgen.t03');
                        });
                        html += '</div></div>';
                    });
                    return html;
                }

                container.innerHTML = '<div class="randomgen-wide">' +
                    '<main class="randomgen-display"><div id="randomResults" class="randomgen-results"></div></main>' +
                    '<footer class="randomgen-footer">' +
                    '<div class="randomgen-bottom-bar">' +
                    t('randomgen.t04') +
                    '<div class="randomgen-row randomgen-row-options">' +
                    t('randomgen.t05') +
                    '<div class="randomgen-count-wrap"><input type="number" id="randomCountInput" min="1" max="99" value="5" class="field-input"><div class="randomgen-presets"><button type="button" class="btn btn-ghost random-count-preset" data-value="1">1</button><button type="button" class="btn btn-ghost random-count-preset" data-value="3">3</button><button type="button" class="btn btn-ghost random-count-preset" data-value="5">5</button><button type="button" class="btn btn-ghost random-count-preset" data-value="10">10</button></div></div>' +
                    t('randomgen.t06') +
                    t('randomgen.t07') +
                    t('randomgen.t08') +
                    t('randomgen.t09') +
                    '</div></div>' +
                    '</footer>' +
                    '</div>' +
                    t('randomgen.t10') + buildTopicCardsHtml() + t('randomgen.t11') +
                    t('randomgen.t12') +
                    t('randomgen.t13');

                const selectedTopicIds = new Set<string>();
                const fixedTopicIds = new Set<string>();
                const topicLabels: Record<string, string> = {};
                topics.forEach(function (t) { topicLabels[t.id] = t.label; });
                window.RANDOMGEN_TOPIC_LABELS = topicLabels;

                const topicBtn = container.querySelector('#randomTopicBtn') as HTMLButtonElement;
                const topicLabel = container.querySelector('#randomTopicLabel') as HTMLElement;
                const countInput = container.querySelector('#randomCountInput') as HTMLInputElement;
                const noDupBtn = container.querySelector('#randomNoDupBtn') as HTMLButtonElement;
                var noDuplicate = false;
                noDupBtn.onclick = function () {
                    noDuplicate = !noDuplicate;
                    noDupBtn.classList.toggle('active', noDuplicate);
                    noDupBtn.title = noDuplicate ? t('randomgen.t14') : t('randomgen.t15');
                };
                const genBtn = container.querySelector('#randomGenBtn') as HTMLButtonElement;

                function getCount(): number {
                    var v = parseInt(countInput.value, 10);
                    return (isNaN(v) || v < 1) ? 1 : Math.min(99, v);
                }
                function setCount(n: number): void {
                    n = Math.max(1, Math.min(99, n));
                    countInput.value = String(n);
                    container.querySelectorAll<HTMLButtonElement>('.random-count-preset').forEach(function (btn) {
                        btn.classList.toggle('active', parseInt(btn.dataset.value!, 10) === n);
                    });
                }
                function updateCountPresetStyle(): void {
                    var n = getCount();
                    container.querySelectorAll<HTMLButtonElement>('.random-count-preset').forEach(function (btn) {
                        btn.classList.toggle('active', parseInt(btn.dataset.value!, 10) === n);
                    });
                }
                countInput.addEventListener('input', function () {
                    updateCountPresetStyle();
                });
                countInput.addEventListener('change', function () {
                    setCount(getCount());
                });
                container.querySelectorAll<HTMLButtonElement>('.random-count-preset').forEach(function (btn) {
                    btn.onclick = function () { setCount(parseInt(btn.dataset.value!, 10)); };
                });
                setCount(5);

                function updateTopicLabel(): void {
                    topicLabel.textContent = selectedTopicIds.size ? selectedTopicIds.size + t('randomgen.t16') : t('randomgen.t17');
                }
                function updateOptionsWrap(): void {
                    var wrap = container.querySelector('#randomTopicOptionsWrap') as HTMLElement;
                    var selectedList = container.querySelector('#randomTopicSelectedList') as HTMLElement;
                    container.querySelectorAll<HTMLElement>('.randomgen-topic-custom').forEach(function (card) {
                        var id = card.dataset.value!;
                        card.classList.toggle('selected', selectedTopicIds.has(id));
                        card.classList.toggle('pinned', fixedTopicIds.has(id));
                    });
                    wrap.style.display = '';
                    if (selectedTopicIds.size > 0) {
                        selectedList.innerHTML = Array.from(selectedTopicIds).map(function (id) {
                            var label = esc(topicLabels[id] || id);
                            var pinned = fixedTopicIds.has(id);
                            var pinSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v10m0 0l-3-3m3 3l3-3M5 12v7a1 1 0 001 1h12a1 1 0 001-1v-7"/></svg>';
                            var pinTitle = pinned ? t('randomgen.t18') : t('randomgen.t19');
                            return '<span class="randomgen-topic-selected-chip' + (pinned ? ' pinned' : '') + '" data-topic-id="' + esc(id) + '"><span class="randomgen-chip-label">' + label + '</span><button type="button" class="randomgen-topic-pin" data-topic-id="' + esc(id) + '" title="' + pinTitle + '">' + pinSvg + '</button></span>';
                        }).join('');
                        selectedList.querySelectorAll<HTMLButtonElement>('.randomgen-topic-pin').forEach(function (btn) {
                            btn.onclick = function (e: MouseEvent) {
                                e.stopPropagation();
                                var id = btn.dataset.topicId!;
                                if (fixedTopicIds.has(id)) fixedTopicIds.delete(id); else fixedTopicIds.add(id);
                                updateOptionsWrap();
                            };
                        });
                        selectedList.querySelectorAll<HTMLElement>('.randomgen-topic-selected-chip').forEach(function (chip) {
                            chip.onclick = function (e: MouseEvent) {
                                if ((e.target as HTMLElement).closest('.randomgen-topic-pin')) return;
                                var id = chip.dataset.topicId!;
                                selectedTopicIds.delete(id);
                                fixedTopicIds.delete(id);
                                updateTopicLabel();
                                updateOptionsWrap();
                            };
                        });
                    } else {
                        selectedList.innerHTML = t('randomgen.t20');
                    }
                }

                var topicPopup = container.querySelector('#randomTopicPopup') as HTMLElement;
                topicBtn.onclick = function () { switchTopicTab('select'); updateOptionsWrap(); topicPopup.classList.add('open'); };
                (container.querySelector('#randomTopicClose') as HTMLElement).onclick = function () { topicPopup.classList.remove('open'); };
                (container.querySelector('#randomTopicSelectAll') as HTMLElement).onclick = function () {
                    topics.forEach(function (t) { selectedTopicIds.add(t.id); });
                    updateTopicLabel();
                    updateOptionsWrap();
                };
                (container.querySelector('#randomTopicDeselectAll') as HTMLElement).onclick = function () {
                    selectedTopicIds.clear();
                    fixedTopicIds.clear();
                    updateTopicLabel();
                    updateOptionsWrap();
                };
                topicPopup.onclick = function (e: MouseEvent) { if (e.target === topicPopup) topicPopup.classList.remove('open'); };
                container.querySelector('#randomTopicList')!.addEventListener('click', function (e) {
                    const target = e.target as HTMLElement;
                    if (target.closest('.randomgen-topic-info')) return;
                    var customCard = target.closest('.randomgen-topic-custom') as HTMLElement | null;
                    if (customCard && !target.closest('.randomgen-topic-info')) {
                        var id = customCard.dataset.value!;
                        if (selectedTopicIds.has(id)) {
                            selectedTopicIds.delete(id);
                            fixedTopicIds.delete(id);
                        } else {
                            selectedTopicIds.add(id);
                        }
                        updateTopicLabel();
                        updateOptionsWrap();
                    }
                });
                container.querySelector('#randomTopicList')!.addEventListener('click', function (e) {
                    const target = e.target as HTMLElement;
                    var infoBtn = target.closest('.randomgen-topic-info') as HTMLElement | null;
                    if (!infoBtn) return;
                    e.stopPropagation();
                    var tid = infoBtn.dataset.topicId!;
                    var topic = topics.find(function (x) { return x.id === tid; });
                    if (!topic) return;
                    var items = getTopicItems(topic);
                    var isGen = !!topic.generator && !topic.items;
                    var title = topic.label + (isGen ? t('randomgen.t21') : '');
                    var cellHtml = items.map(function (it) { return '<span class="randomgen-table-tag">' + esc(it) + '</span>'; }).join('');
                    (container.querySelector('#randomTableTitle') as HTMLElement).textContent = title;
                    (container.querySelector('#randomTableContent') as HTMLElement).innerHTML = cellHtml || '<span style="color:var(--text-tertiary);">항목 없음</span>';
                    container.querySelector('#randomTablePopup')!.classList.add('open');
                });
                (container.querySelector('#randomTableClose') as HTMLElement).onclick = function () { container.querySelector('#randomTablePopup')!.classList.remove('open'); };
                const tablePopupEl = container.querySelector('#randomTablePopup') as HTMLElement;
                tablePopupEl.onclick = function (e: MouseEvent) { if (e.target === tablePopupEl) tablePopupEl.classList.remove('open'); };

                var infoPopup = container.querySelector('#randomInfoPopup') as HTMLElement;
                (container.querySelector('#randomInfoBtn') as HTMLElement).onclick = function () { infoPopup.classList.add('open'); };
                (container.querySelector('#randomInfoClose') as HTMLElement).onclick = function () { infoPopup.classList.remove('open'); };
                infoPopup.onclick = function (e: MouseEvent) { if (e.target === infoPopup) infoPopup.classList.remove('open'); };

                function switchTopicTab(tabId: string): void {
                    container.querySelectorAll<HTMLElement>('.randomgen-topic-tab').forEach(function (t) { t.classList.toggle('active', t.dataset.tab === tabId); });
                    container.querySelectorAll<HTMLElement>('.randomgen-topic-tab-panel').forEach(function (p) { p.classList.toggle('active', p.dataset.tab === tabId); });
                }
                container.querySelectorAll<HTMLElement>('.randomgen-topic-tab').forEach(function (tab) {
                    tab.onclick = function () { switchTopicTab(tab.dataset.tab!); };
                });
                (container.querySelector('#addTopicBtn') as HTMLButtonElement).onclick = function () {
                    var label = ((container.querySelector('#addTopicLabel') as HTMLInputElement).value || '').trim();
                    var idRaw = ((container.querySelector('#addTopicId') as HTMLInputElement).value || '').trim();
                    var id = idRaw ? idRaw.replace(/\s+/g, '_') : (label ? label.replace(/\s+/g, '_') : '');
                    var group = ((container.querySelector('#addTopicGroup') as HTMLInputElement).value || '기타').trim();
                    var itemsStr = ((container.querySelector('#addTopicItems') as HTMLTextAreaElement).value || '').trim();
                    var items = itemsStr.split(/[,，]/).map(function (s) { return s.trim(); }).filter(Boolean);
                    var msgEl = container.querySelector('#addTopicMsg') as HTMLElement;
                    if (!id || !label || items.length === 0) {
                        msgEl.textContent = t('randomgen.t22');
                        msgEl.style.color = 'var(--accent)';
                        return;
                    }
                    if (topics.some(function (t) { return t.id === id; })) {
                        msgEl.textContent = t('randomgen.t23');
                        msgEl.style.color = 'var(--accent)';
                        return;
                    }
                    topics.push({ id: id, label: label, group: group, items: items });
                    if (window.RANDOMGEN_TOPIC_LABELS) window.RANDOMGEN_TOPIC_LABELS[id] = label;
                    var list = container.querySelector('#randomTopicList') as HTMLElement;
                    var grp = Array.from(list.querySelectorAll<HTMLElement>('.randomgen-topic-group')).find(function (g) { return g.querySelector('.randomgen-topic-group-title')!.textContent === group; }) as HTMLElement | undefined;
                    if (!grp) {
                        grp = document.createElement('div');
                        grp.className = 'randomgen-topic-group';
                        grp.innerHTML = '<div class="randomgen-topic-group-title">' + esc(group) + '</div><div class="randomgen-topic-cards"></div>';
                        list.appendChild(grp);
                    }
                    var cards = grp.querySelector('.randomgen-topic-cards') as HTMLElement;
                    var card = document.createElement('div');
                    card.className = 'randomgen-topic-card randomgen-topic-custom';
                    card.dataset.value = id;
                    card.innerHTML = '<span class="randomgen-topic-card-label">' + esc(label) + '</span><button type="button" class="randomgen-topic-info" data-topic-id="' + esc(id) + t('randomgen.t24');
                    cards.appendChild(card);
                    (container.querySelector('#addTopicId') as HTMLInputElement).value = '';
                    (container.querySelector('#addTopicLabel') as HTMLInputElement).value = '';
                    (container.querySelector('#addTopicItems') as HTMLTextAreaElement).value = '';
                    msgEl.textContent = '"' + label + t('randomgen.t25');
                    msgEl.style.color = 'var(--text-secondary)';
                    Mdd.linePreset('success', { mood: 'happy', msg: t('randomgen.t26') });
                    switchTopicTab('select');
                    updateOptionsWrap();
                };
                const storyBtn = container.querySelector('#randomStoryBtn') as HTMLButtonElement | null;
                const resultsEl = container.querySelector('#randomResults') as HTMLElement;
                let lastBatchResults: GenResult[] = [];

                const copyBtn = container.querySelector('#randomCopyBtn') as HTMLButtonElement | null;
                if (copyBtn) {
                    copyBtn.onclick = function () {
                        var text = lastBatchResults.map(function (r) { return r.name; }).join(', ');
                        if (!text) return;
                        if (navigator.clipboard) {
                            navigator.clipboard.writeText(text);
                            Toolbox.showToast!(t('randomgen.t27') + lastBatchResults.length + t('randomgen.t28'));
                        }
                    };
                }

                function generateBatch(): void {
                    resultsEl.innerHTML = '';
                    if (copyBtn) copyBtn.style.display = 'none';
                    const count = getCount();

                    let targetTopics: Topic[] = [];
                    if (selectedTopicIds.size > 0) {
                        selectedTopicIds.forEach(function (id) {
                            var topic = topics.find(function (x) { return x.id === id; });
                            if (topic) targetTopics.push(topic);
                        });
                    } else {
                        targetTopics = topics.slice();
                    }

                    if (!targetTopics.length) {
                        resultsEl.innerHTML = t('randomgen.t29');
                        return;
                    }

                    const allResults: GenResult[] = [];
                    var seenNames = new Set<string>();
                    fixedTopicIds.forEach(function (fixedId) {
                        if (!selectedTopicIds.has(fixedId)) return;
                        var topic = topics.find(function (x) { return x.id === fixedId; });
                        if (topic && targetTopics.some(function (x) { return x.id === fixedId; })) {
                            var r = generate(topic, 1)[0];
                            if (r) {
                                allResults.push(r);
                                seenNames.add(r.name);
                            }
                        }
                    });
                    var remain = count - allResults.length;
                    for (var i = 0; i < remain; i++) {
                        let r: GenResult | null = null;
                        if (noDuplicate) {
                            for (var retries = 0; retries < 100; retries++) {
                                var topic = pick(targetTopics);
                                var candidate = generate(topic, 1)[0];
                                if (candidate && !seenNames.has(candidate.name)) {
                                    r = candidate;
                                    seenNames.add(candidate.name);
                                    break;
                                }
                            }
                        } else {
                            var topic = pick(targetTopics);
                            r = generate(topic, 1)[0];
                            if (r) seenNames.add(r.name);
                        }
                        if (r) allResults.push(r);
                    }
                    for (var j = allResults.length - 1; j > 0; j--) {
                        var k = Math.floor(Math.random() * (j + 1));
                        var tmp: GenResult = allResults[j];
                        allResults[j] = allResults[k];
                        allResults[k] = tmp;
                    }

                    lastBatchResults = allResults.slice();

                    function isHexColor(s: string): boolean { return /^#[0-9a-fA-F]{6}$/.test(String(s)); }
                    function hexLuminance(hex: string): number {
                        var m = hex.match(/^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/);
                        if (!m) return 0;
                        var r = parseInt(m[1], 16) / 255, g = parseInt(m[2], 16) / 255, b = parseInt(m[3], 16) / 255;
                        return 0.299 * r + 0.587 * g + 0.114 * b;
                    }
                    const colorNameToHex: Record<string, string> = { [t('randomgen.t30')]:'#dc2626',[t('randomgen.t31')]:'#ea580c',[t('randomgen.t32')]:'#eab308',[t('randomgen.t33')]:'#22c55e',[t('randomgen.t34')]:'#3b82f6',[t('randomgen.t35')]:'#1e40af',[t('randomgen.t36')]:'#8b5cf6',[t('randomgen.t37')]:'#ec4899',[t('randomgen.t38')]:'#f8fafc',[t('randomgen.t39')]:'#1e293b',[t('randomgen.t40')]:'#64748b',[t('randomgen.t41')]:'#d4a574',[t('randomgen.t42')]:'#eab308',[t('randomgen.t43')]:'#94a3b8',[t('randomgen.t44')]:'#14b8a6',[t('randomgen.t45')]:'#881337' };
                    function getCardBgColor(result: GenResult): string | null {
                        if (isHexColor(result.name)) return result.name;
                        if (result.sub === t('randomgen.t46') && colorNameToHex[result.name]) return colorNameToHex[result.name];
                        return null;
                    }
                    var ccgColors = ['blue', 'purple', 'gold', 'green', 'red'];
                    allResults.forEach(function (result, idx) {
                        const card = document.createElement('div');
                        var ccgClass = 'randomgen-ccg-' + ccgColors[Math.floor(Math.random() * ccgColors.length)];
                        var bgHex = getCardBgColor(result);
                        var isColor = !!bgHex;
                        if (isColor) ccgClass = 'randomgen-ccg-hex';
                        card.className = 'randomgen-result-card randomgen-ccg ' + ccgClass;
                        card.style.animationDelay = (idx * 120) + 'ms';
                        card.title = t('randomgen.t47');
                        const nameEsc = esc(result.name);
                        const subEsc = esc(result.sub);
                        var frameStyle = '';
                        var titleClass = 'randomgen-ccg-title';
                        if (isColor) {
                            frameStyle = ' style="background:' + bgHex + '!important;border-color:' + bgHex + ';"';
                            if (hexLuminance(bgHex!) > 0.6) titleClass += ' randomgen-ccg-title-dark';
                        }
                        card.innerHTML = '<div class="randomgen-card-inner"><div class="randomgen-card-back"><span class="randomgen-card-question">?</span></div><div class="randomgen-card-front"><div class="randomgen-ccg-frame"' + frameStyle + '><div class="randomgen-ccg-title-area"><div class="' + titleClass + '">' + nameEsc + '</div></div><div class="randomgen-ccg-type">' + subEsc + '</div></div></div></div>';
                        resultsEl.appendChild(card);
                        (function (c) {
                            setTimeout(function () { c.classList.add('revealed'); }, 350 + idx * 100);
                        })(card);

                        (function (cardEl, text) {
                            var inner = cardEl.querySelector('.randomgen-card-inner') as HTMLElement | null;
                            var maxTilt = 22;
                            cardEl.addEventListener('click', function () {
                                if (!cardEl.classList.contains('revealed')) return;
                                if (navigator.clipboard) {
                                    navigator.clipboard.writeText(text).then(function () {
                                        Toolbox.showToast!(t('randomgen.t48'));
                                    }).catch(function () {});
                                }
                            });
                            cardEl.addEventListener('mousemove', function (e: MouseEvent) {
                                if (!cardEl.classList.contains('revealed')) return;
                                var rect = cardEl.getBoundingClientRect();
                                var x = (e.clientX - rect.left) / rect.width - 0.5;
                                var y = (e.clientY - rect.top) / rect.height - 0.5;
                                var rotY = x * maxTilt * 2;
                                var rotX = -y * maxTilt * 2;
                                cardEl.classList.add('randomgen-tilt');
                                if (inner) inner.style.transform = 'rotateY(180deg) rotateX(' + rotX + 'deg) rotateY(' + rotY + 'deg)';
                            });
                            cardEl.addEventListener('mouseleave', function () {
                                cardEl.classList.remove('randomgen-tilt');
                                if (inner) inner.style.transform = cardEl.classList.contains('revealed') ? 'rotateY(180deg)' : '';
                            });
                        })(card, result.name);
                    });

                    if (storyBtn) storyBtn.style.display = '';
                    if (copyBtn) copyBtn.style.display = '';

                    if (noDuplicate && allResults.length < count) {
                        Toolbox.showToast!(t('randomgen.t49') + allResults.length + t('randomgen.t50'), 'warning');
                        Mdd.linePreset('tool_run', { msg: t('randomgen.t51') });
                    } else {
                        Mdd.linePreset('success', { mood: 'happy', msg: t('randomgen.t52') });
                    }
                    Mdd.addAffection(1);
                }

                if (storyBtn) {
                    storyBtn.onclick = function () {
                        var kw = lastBatchResults.map(function (r) { return r.name; });
                        if (kw.length === 0) {
                            Toolbox.showToast!(t('randomgen.t53'), 'error');
                            return;
                        }
                        try {
                            sessionStorage.setItem('toolbox_chatbot_story_keywords', JSON.stringify(kw));
                        } catch (e) {}
                        Toolbox.switchPage!('chatbot');
                        Mdd.linePreset('daily_start', { msg: t('randomgen.t54') });
                    };
                }

                genBtn.onclick = generateBatch;
                generateBatch();
            }
        }]
    });
})();
