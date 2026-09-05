// ═══════════════════════════════════════════════════════════════════════════
// СЛОТ-ДВИЖОК — типы (JSDoc), проверяются `tsc --checkJs` (npm run typecheck),
// не транспилируются и не попадают в браузер — чистая документация формы
// данных, тот же принцип «без сборки», что и во всём проекте. Только typedef,
// НЕТ рантайм-кода — `export {}` ниже нужен только чтобы файл считался ES-
// модулем (иначе `import('./slot-engine-types.js').Ctx` в других файлах не
// резолвился бы).
//
// Источник правды для полей data.ops — slot-engine-validate.js (та же форма,
// что она проверяет в рантайме); источник для Ctx — то, как он собирается в
// slot-engine-mount.js (расширялся по мере переноса apply*-функций на
// уровень модуля, Стадия 2, см. CLAUDE.md Часть 3).
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Ссылка на один или несколько слотов — те же формы, что понимает
 * resolveSlotRef (slot-engine-words.js): число, массив (рекурсивно), либо
 * {word, length?, anchor?} — «последние/первые N слотов такой-то группы».
 * @typedef {number | SlotRef[] | {word: number, length?: number, anchor?: 'start'|'end'}} SlotRef
 */

/** @typedef {{slot: number, tr: string}} InitialItem */

/** Авторский шаг (грамматика/правило N) из data.steps.
 * @typedef {Object} Step
 * @property {'grammar'|'rule'} kind
 * @property {number} start
 * @property {number} end
 * @property {'ALL'|SlotRef} activeSlots
 * @property {number} [ruleNum] - только для kind:'rule'
 * @property {number} [color] - цвет чипа ленты шагов
 * @property {boolean} [primary] - цвет по умолчанию охровый (is-grammar), primary:true даёт цвет группы
 * @property {string} [label] - переопределяет подпись чипа («Грамматика»/«Правило N» по умолчанию)
 */

/** Шаг таймлайна — авторский (из data.steps) ИЛИ синтетический (движок сам
 * вставляет такой до первого и после последнего авторского шага, и в
 * зазорах между шагами с разным составом участников — buildRuntimeSteps,
 * slot-engine-steps.js). Код не различает эти два случая отдельными
 * типами — просто проверяет `_virtual`/`_reveal` truthy-веткой (`undefined`
 * ложно на настоящем Step) — поэтому один плоский тип с необязательными
 * полями обеих разновидностей, не строгое объединение: он точнее отражает,
 * как это реально читается кодом, чем дискриминированный union.
 * @typedef {Object} RuntimeStep
 * @property {number} start
 * @property {number} end
 * @property {'ALL'|number[]} activeSlots - УЖЕ разрешён в плоский массив слотов (resolveSlotRef), не сырой SlotRef автора
 * @property {'grammar'|'rule'} [kind]
 * @property {number} [ruleNum]
 * @property {number} [color]
 * @property {boolean} [primary]
 * @property {string} [label]
 * @property {true} [_virtual] - синтетический хвост/пролог, не из data.steps
 * @property {true} [_reveal] - синтетическое проявление в зазоре между шагами
 * @property {HTMLElement} [_chipEl] - кнопка в ленте шагов (только у авторских шагов)
 */

/** Дуга прилёта — используется в split.arrivals и arrive.items.
 * @typedef {Object} ArcSpec
 * @property {string} into — буква, в которую превращается прилетевший кубик
 * @property {number} newSlot
 * @property {{x: number, y: number, z: number}} from
 * @property {number} delay — используется БЕЗ дефолта, обязателен
 * @property {number} dur — используется БЕЗ дефолта, обязателен
 * @property {number} [arcHeight] - высота дуги полёта, дефолт 1.0 (flyArcPosition)
 */

/** Поля с подчёркиванием (`_frameHoldEnd` и т.д. во всех Op-типах ниже) —
 * ВНУТРЕННЕЕ состояние движка, записывается ПРЯМО на объект op во время
 * показа (см. slot-engine-mount.js — сделано так намеренно, чтобы состояние
 * не делилось между двумя пересёкшимися по времени монтированиями одного и
 * того же модуля). Не задаются в данных примера, не описаны в
 * validateExampleData — их наличие в типе только чтобы опечатка во ВНУТРЕННЕМ
 * имени поля (например `_pulse0` вместо `_pulse1`) тоже ловилась tsc, как и
 * ошибка в авторском поле.
 * @typedef {Object} InfluenceOp
 * @property {'influence'} type
 * @property {SlotRef} from
 * @property {number} to
 * @property {number} start
 * @property {number} [ringHoldDur]
 * @property {number} [ringPulsePeriod]
 * @property {string} [ringRgb] - явное переопределение цвета кольца, строка "R,G,B" (см. ringColorFrom/GROUP_RGB) — по умолчанию: GROUP_RGB при нескольких источниках, иначе собственный фонетический цвет единственного источника; используется, чтобы дать ОБЩИЙ цвет ДВУМ встречным influence одной равнозначной пары (иначе разный цвет читается как несогласованность, хотя тайминг общий)
 * @property {number} [waveCount]
 * @property {number} [waveGap]
 * @property {number} [waveTravel]
 * @property {'gold'|'silver'} [frameSignal] - подчёркивание группы в цвет предстоящей огласовки (updateGroupFrame), без него — нейтральный GROUP_COLOR, только для групп >1
 * @property {number} [_frameHoldEnd]
 * @property {boolean} [_ringOff]
 * @property {HTMLElement | null} [_frameEl] - используется updateGroupFrame
 */

/** @typedef {Object} ApproachOp
 * @property {'approach'} type
 * @property {SlotRef} [movers]
 * @property {SlotRef} [mover] - movers ИЛИ mover, не оба обязательны
 * @property {number[]} [fromX] - переопределение стартовой мировой позиции по мувер-индексу (тот же порядок, что movers/slots) — нужно, когда мувер уже физически не на своём слоте (например, после merge на общем зазоре); по умолчанию slotX(slot)
 * @property {number} [blankAtProgress] - доля approachDur (0..1), по достижении которой буква на грани мувера(ов) исчезает (matsBlank) — «кубики наполовину соприкоснулись»
 * @property {boolean} [_blanked]
 * @property {number} target
 * @property {number} start
 * @property {number} [approachDur]
 * @property {number} [distance]
 * @property {boolean} [retreat]
 * @property {number} [retreatDur]
 * @property {number} [jitterAmp]
 * @property {boolean} [pulse]
 * @property {number} [midDistance] - двухотрезочный путь: подъезд → пауза → довершение
 * @property {number} [midHoldDur]
 * @property {number} [leg2Dur]
 * @property {number} [holdDur]
 * @property {boolean} [holdPulse] - непрерывный текстурный пульс на триггере во время паузы
 * @property {string} [holdPulseColor] - строка "R,G,B" (см. ringColorFrom), не hex-число
 * @property {number} [holdPulsePeriod]
 * @property {number} [holdWaveGap]
 * @property {number} [holdWaveTravel]
 * @property {boolean} [_pulseOff]
 * @property {boolean} [_pulsed]
 */

/** @typedef {Object} TransformOp
 * @property {'transform'} type
 * @property {number} at
 * @property {string} toGlyph
 * @property {number} start
 * @property {number} [atX] - мировая позиция вращения/посадки, если кубик физически переехал ДО transform (например, слился с соседом на общем зазоре через merge) — по умолчанию slotX(at)
 * @property {number} [spinTurns] - 0.5=180° парная замена, 1=360° гуна/ассимиляция, 2=720° вриддхи (см. TRANSFORM_KIND)
 * @property {'silver'|'gold'|'blank'} [signal]
 * @property {number} [clearance] - боковое раскачивание (X), знак = направление к пустому месту
 * @property {number} [clearanceZ] - выдвижение на зрителя (+Z) во время вращения, тот же колокол sin(t·π), что и clearance/bounceH — нужно, когда сосед стоит ВПЛОТНУЮ (без зазора), чтобы диагональные углы вращающегося куба физически не проходили сквозь его текстуру; дефолт 0
 * @property {number} [anticipateDur] - пауза-осознание до вращения
 * @property {number} [signalHoldDur] - сигнальный цвет (серебро/золото/нейтраль) держится ЕЩЁ это время после остановки вращения, прежде чем перекраситься в истинный цвет; дефолт 250
 * @property {number} [holdDur] - пауза-фиксация ПОСЛЕ signalHoldDur (в истинном цвете) — op._done срабатывает через signalHoldDur+holdDur после посадки
 * @property {number} [dur] - переопределение длительности вращения (мс), для ЛЮБОГО spinTurns (не только landsOnOppositeFace); дефолт без переопределения — 1800 при landsOnOppositeFace, иначе spinTurns×MS_PER_360
 * @property {number} [bounceH]
 * @property {number} [toColor]
 * @property {string} [label] - текст плавающей пилюли-подписи над кубиком на время активного вращения (см. spawnLabelPill), например "guṇa"/"vṛddhi"/"jaśtva" (строчными, ИАСТ — см. реестр CLAUDE.md)
 * @property {number} [labelY] - переопределение высоты пилюли (мировые координаты) — нужно, когда несколько событий одного шага должны читаться на одном уровне, см. rule50
 * @property {number} [labelX] - горизонтальное смещение пилюли (мировые единицы), СКЛАДЫВАЕТСЯ с homeX (не заменяет) — нужно, когда в том же шаге есть ДРУГАЯ пилюля на том же кубике (merge непосредственно перед этим transform, см. rule1/rule2) и обе должны читаться на ОДНОЙ ЛИНИИ (общий labelY), разведёнными по X, а не друг над другом
 * @property {boolean} [startBlank] - кубик уже погашен (matsBlank) ДО начала вращения предшествующим approach/merge с blankAtProgress — сигнальная фаза начинает СРАЗУ с пустой грани (тот же временный набор, что и штатная disappear-стадия), не перерисовывает старую букву; дефолт false, см. rule1/rule2
 * @property {boolean} [_done]
 * @property {boolean} [_pulse0]
 * @property {boolean} [_pulse1]
 * @property {boolean} [_anticipateDone]
 * @property {boolean} [_began]
 * @property {boolean} [_disappeared] - старая буква сменилась на пустую грань (multi-turn, ИЛИ сразу при startBlank, см. applyTransform)
 * @property {boolean} [_revealed]
 * @property {boolean} [_landed]
 * @property {boolean} [_colorReverted]
 * @property {number} [_rotationEnd]
 * @property {number} [_pendingColor] - при landsOnOppositeFace: цвет, который нужно применить в regenMats после приземления
 * @property {MatSet} [_blankSignalMats] - временный набор без буквы на время ожидания между _disappeared и _revealed (multi-turn), уничтожается сразу после reveal
 */

/** @typedef {Object} SplitOp
 * @property {'split'} type
 * @property {number} at
 * @property {ArcSpec[]} arrivals
 * @property {number} start
 * @property {number} [anticipateDur]
 * @property {number} [riseDur]
 * @property {number} [holdDur]
 * @property {{x: number, y: number, z: number}} [holdOffset]
 * @property {number} [holdOpacity]
 * @property {number} [fadeDur]
 * @property {string} [label] - текст плавающей пилюли-подписи над источником (см. spawnLabelPill), например "Полугласный"
 * @property {number} [labelY] - переопределение высоты пилюли (мировые координаты) — только когда дефолт (CUBE_SIZE*1.6) конфликтует с геометрией КОНКРЕТНОГО примера (arrivals/holdOffset), см. rule50
 * @property {number} [labelX] - переопределение бокового смещения пилюли (мировые единицы, СМЕЩЕНИЕ от slotX(at), тот же смысл, что x в spawnLabelPill) — когда arrivals пролетают через зону над слотом, сдвиг в сторону, куда траектория прилёта математически не заходит (монотонный lerp), категорически исключает пересечение, см. rule50
 * @property {string} [_srcKey]
 * @property {boolean} [_pulse0]
 * @property {boolean} [_pulse1]
 * @property {boolean} [_anticipateDone]
 * @property {Object<number, Cube>} [_arrived] - newSlot → уже созданный прилетевший кубик
 */

/** @typedef {Object} ArriveOp
 * @property {'arrive'} type
 * @property {ArcSpec[]} items
 * @property {number} start
 * @property {Object<number, Cube>} [_made] - newSlot → уже созданный кубик
 */

/** @typedef {Object} MergeOp
 * @property {'merge'} type
 * @property {number} from
 * @property {number} at
 * @property {string} toGlyph
 * @property {number} start
 * @property {number} [dur]
 * @property {number} [pulseHoldMs]
 * @property {number} [toColor]
 * @property {string} [label] - текст плавающей пилюли-подписи над целью (см. spawnLabelPill), например "Слияние"
 * @property {number} [labelY] - переопределение высоты пилюли — нужно, когда в одном шаге есть ДРУГОЕ событие со своей пилюлью, чтобы обе читались раздельно, не сливались в одну (см. rule1: merge ekādeśa + следующий transform vṛddhi)
 * @property {number} [labelX]
 * @property {number} [blankAtProgress] - доля dur (0..1), по достижении которой буква на грани мувера исчезает (matsBlank) — «кубики наполовину соприкоснулись»
 * @property {boolean} [_done]
 * @property {number} [_pulsedAt]
 * @property {boolean} [_decayDone]
 * @property {boolean} [_blanked]
 * @property {boolean} [_labelSpawned]
 */

/** @typedef {Object} BudOp
 * @property {'bud'} type
 * @property {number} from - слот источника, откуда «отпочковывается» клон
 * @property {number} to - слот, куда клон прилетает (обычно пустой на момент старта)
 * @property {string} toGlyph - глиф клона; тот же, что у источника, для настоящей геминации (см. rule61)
 * @property {number} start
 * @property {number} [dur]
 * @property {number} [flashDecay] - длительность спада вспышки на источнике (мс), тот же темп, что holdDur у merge
 * @property {number} [pulseHoldMs]
 * @property {string} [label] - текст плавающей пилюли-подписи над источником (см. spawnLabelPill)
 * @property {number} [labelY]
 * @property {number} [labelX]
 * @property {boolean} [_done]
 * @property {Cube} [_clone]
 * @property {number} [_flashAt]
 */

/** @typedef {Object} ElideOp
 * @property {'elide'} type
 * @property {number} at
 * @property {number} start
 * @property {number} [riseDur]
 * @property {number} [holdDur]
 * @property {{x: number, y: number, z: number}} [holdOffset]
 * @property {number} [fadeDur]
 * @property {string} [impactColor] - строка "R,G,B" для rgba() (см. GROUP_RGB/SILVER_RGB), не hex-число
 * @property {boolean} [quiet] - true = без искр/ускоренного сжатия (побочное исчезновение внутри чужого главного события, см. CLAUDE.md Часть 4); default = драматично (искры+синхронное сжатие)
 * @property {string} [label] - текст плавающей пилюли-подписи ПОД кубиком (см. spawnLabelPill), например "Элизия"
 * @property {boolean} [_done]
 * @property {number} [_impactAt]
 * @property {number} [_fadeStartedAt]
 * @property {boolean} [_labelSpawned]
 */

/** @typedef {Object} SettleOp
 * @property {'settle'} type
 * @property {number[]} slots
 * @property {number} start
 * @property {number} [stepDelay]
 * @property {number} [bounceDur]
 * @property {number} [bounceH]
 */

/** @typedef {Object} DimOp
 * @property {'dim'} type
 * @property {number[]} slots
 * @property {number} start
 * @property {number} end — используется БЕЗ дефолта, обязателен
 * @property {number} [dimOpacity]
 * @property {number} [ramp]
 */

/** @typedef {InfluenceOp|ApproachOp|TransformOp|SplitOp|ArriveOp|MergeOp|BudOp|ElideOp|SettleOp|DimOp} SlotOp */

/** Данные примера — то, что приходит из docs/app/examples/ruleN-*.js и
 * проверяется validateExampleData ДО первого кадра. Поля ниже, КРОМЕ
 * initial/steps/ops, НЕ проверяются validateExampleData вообще — только
 * общие настройки таймингов с `??`-дефолтом в mountSlotExample/applyStepDim,
 * собраны здесь в одно место — раньше знание о них было рассеяно по
 * инлайновым комментариям в двух разных файлах.
 * @typedef {Object} ExampleData
 * @property {InitialItem[]} initial
 * @property {Step[]} [steps]
 * @property {SlotOp[]} [ops]
 * @property {number} [dimOpacity] - прозрачность притенённого кубика, дефолт 0.22
 * @property {number} [stepRamp] - плавный переход на границе шагов, мс, дефолт 550
 * @property {number} [revealStagger] - задержка волны проявления между соседними слотами, мс, дефолт 130
 * @property {number} [revealRamp] - длительность самого перехода волны проявления, мс, дефолт 700
 * @property {number} [settleDelay] - пауза перед автостартом settle после конца проявления, мс, дефолт 1000
 * @property {number} [fallStagger] - задержка падения между соседними по порядку буквами, мс, дефолт 260
 * @property {number} [fallDur] - длительность падения одной буквы, мс, дефолт 1300
 */

/** Один набор из 6 материалов граней кубика (см. buildOneMatSet, chalk-module.js).
 * @typedef {import('three').MeshStandardMaterial[]} MatSet
 */

/** Текстура передней грани, которая умеет перерисовываться под пульс
 * (см. buildPulseFace/redrawPulseFace/setFacePulse) — кешируется на кубике
 * в cube._pulseFace, не пересоздаётся на каждый пульс.
 * @typedef {Object} PulseFace
 * @property {import('three').MeshStandardMaterial} material
 * @property {HTMLCanvasElement} canvas
 * @property {HTMLCanvasElement} baseCanvas — чистая заливка без кольца, эталон для перерисовки
 * @property {string} [glyph]
 */

/** Кубик слота — не класс, обычный объект (makeCube, slot-engine-cube.js).
 * matsBlank/matsReady/matsSignal/matsGold — ленивые (см. defineMatsSlot),
 * строятся только при первом реальном обращении. _fallDone/_pulseFace/
 * _pulsingMats — записываются apply*-функциями во время показа, не частью
 * makeCube.
 * @typedef {Object} Cube
 * @property {string} tr
 * @property {number} color
 * @property {number} seed
 * @property {boolean} _settled
 * @property {import('three').Mesh} mesh
 * @property {import('three').Mesh} shadow
 * @property {MatSet} matsMain
 * @property {MatSet} [matsBlank]
 * @property {MatSet} [matsReady]
 * @property {MatSet} [matsSignal]
 * @property {MatSet} [matsGold]
 * @property {boolean} [_fallDone] - кубик прилетел через дугу (split/arrive), обычное падение пропускается
 * @property {number} [_fallStart] - задержка начала обычного падения, мс (slot-engine-mount.js)
 * @property {number} [_fallDur] - длительность обычного падения, мс
 * @property {PulseFace} [_pulseFace]
 * @property {MatSet} [_pulsingMats] - копия matsMain с гранью [4] подменённой на _pulseFace
 * @property {MatSet} [_oppositeMats] - временный набор на время transform-разворота на противолежащую грань (buildOpposingFaceMaterials) — текущая буква на idx4, будущая на idx5; уничтожается после приземления
 */

/** Общий контекст, который держат все apply*-функции — расширялся по мере
 * переноса на уровень модуля (Стадия 2), ни разу не создавался заново под
 * конкретную функцию (см. CLAUDE.md, Часть 3, «Профессионализация»).
 * @typedef {Object} Ctx
 * @property {Object<number, Cube>} cubes — slot-index → кубик
 * @property {import('three').PerspectiveCamera} camera
 * @property {HTMLElement} stageEl
 * @property {HTMLElement} labelsEl
 * @property {number[][]} wordGroupsList — группы слов по зазорам в data.initial (computeWordGroups)
 * @property {import('three').Scene} scene
 * @property {RuntimeStep[]} runtimeSteps
 * @property {ExampleData} data
 */

/** Возврат mountSlotExample. pause/resume/stepBy/getElapsed — только для
 * тестовых полигонов (test-slot-engine-ruleN.html), не используются самим
 * приложением; добавлены для расследования CLAUDE.md, Часть 6, п.0.
 * @typedef {Object} MountHandle
 * @property {() => void} unmount
 * @property {() => MountHandle} replay
 * @property {() => void} pause
 * @property {() => void} resume
 * @property {(deltaMs: number) => void} stepBy
 * @property {() => number} getElapsed
 * @property {boolean} paused
 */

export {};
