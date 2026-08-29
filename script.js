const GAS_URL = "https://script.google.com/macros/s/AKfycbxUdQIHdh82slcCDoIfc1C1Vsjve_j1QWmp6CsOO8TygT5x-_3qgivpSqSXXphGRuhP3g/exec"; 

let playerName = localStorage.getItem('playerName');
let questionsData = [];
let globalStatus = { firstBlood: {}, solved: {}, questionStatus: {} };
let currentQuestionId = null;
let serverTimeOffset = 0; 
let uiTimer = null;

window.onload = () => {
  if (playerName) {
    showScreen('loading-screen');
    document.getElementById('display-name').innerText = playerName;
    fetchData();
    setInterval(() => { if (playerName && !currentQuestionId) fetchData(); }, 10000);
  } else {
    showScreen('login-screen');
  }
};

function login() {
  const nameInput = document.getElementById('nickname-input').value.trim();
  if (!nameInput) return alert("名前を入力してください");
  playerName = nameInput;
  localStorage.setItem('playerName', playerName);
  document.getElementById('display-name').innerText = playerName;
  showScreen('loading-screen');
  fetchData();
}

function showScreen(screenId) {
  ['login-screen', 'home-screen', 'detail-screen', 'loading-screen'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const target = document.getElementById(screenId);
  if (target) target.style.display = 'block';
}

function showHomeScreen() {
  currentQuestionId = null;
  showScreen('loading-screen');
  fetchData();
}

async function fetchData() {
  try {
    const res = await fetch(GAS_URL);
    const data = await res.json();
    questionsData = data.questions;
    globalStatus = data.status;
    serverTimeOffset = data.serverTime - new Date().getTime();
    
    if (!currentQuestionId) {
      showScreen('home-screen');
      renderQuestionList();
    }
    if (!uiTimer) uiTimer = setInterval(updateUI, 1000);
  } catch (error) {
    console.log("バックグラウンド更新待機中...");
  }
}

function renderQuestionList() {
  document.getElementById('first-blood-count').innerText = globalStatus.firstBlood[playerName] || 0;
  document.getElementById('solve-count').innerText = globalStatus.solved[playerName] || 0;
  
  const listDiv = document.getElementById('question-list');
  listDiv.innerHTML = '';
  
  questionsData.forEach(q => {
    const card = document.createElement('div');
    card.className = 'q-card';
    
    let qStat = globalStatus.questionStatus[q.ID];
    if (qStat) {
      if (qStat.fbPlayer === playerName) {
        card.classList.add('first-blood');
        card.innerHTML = `<strong>Q${q.ID}. ${q.Title} 👑</strong>`;
      } else if (qStat.solvers.includes(playerName)) {
        card.classList.add('cleared');
        card.innerHTML = `<strong>Q${q.ID}. ${q.Title} ✅</strong>`;
      } else if (qStat.solvers.length > 0) {
        card.classList.add('others-cleared');
        card.innerHTML = `<strong>Q${q.ID}. ${q.Title} 👥</strong>`;
      } else {
        card.innerHTML = `<strong>Q${q.ID}. ${q.Title}</strong>`;
      }
    } else {
      card.innerHTML = `<strong>Q${q.ID}. ${q.Title}</strong>`;
    }
    
    card.onclick = () => openDetail(q.ID);
    listDiv.appendChild(card);
  });
}

function openDetail(id) {
  currentQuestionId = id;
  const q = questionsData.find(item => item.ID === id);
  if (!q) return;

  // 古いヒントが残らないよう、開いた瞬間に完全に初期化
  const dynTextDiv = document.getElementById('detail-dynamic-text');
  if (dynTextDiv) {
    dynTextDiv.style.display = 'none';
    dynTextDiv.innerHTML = '';
  }

  document.getElementById('detail-title').innerText = `Q${q.ID}. ${q.Title}`;
  document.getElementById('detail-description').innerHTML = q.Description.replace(/\n/g, '<br>');
  document.getElementById('detail-cooltime').innerText = q.CoolTime;
  
  const mediaDiv = document.getElementById('detail-media');
  mediaDiv.innerHTML = ''; 

  const hintContainer = document.createElement('div');
  hintContainer.id = 'hint-media-container';
  mediaDiv.appendChild(hintContainer);

  const mainMediaContainer = document.createElement('div');
  if (q.Media) {
    mainMediaContainer.innerHTML = q.Media; 
    mainMediaContainer.querySelectorAll('img').forEach(img => img.onclick = () => openModal(img.src));
    mediaDiv.appendChild(mainMediaContainer);
    mediaDiv.style.display = 'block';
  } else {
    mediaDiv.style.display = 'none';
  }

  const normalArea = document.getElementById('normal-answer-area');
  const multiArea = document.getElementById('multi-answer-area');
  
  if (q.Config && q.Config.type === 'multi') {
    normalArea.style.display = 'none';
    multiArea.style.display = 'block';
    document.getElementById('multi-single-input').value = '';
    renderMultiProgress(q.ID, q.Config.required);
  } else {
    normalArea.style.display = 'block';
    multiArea.style.display = 'none';
    const ansInput = document.getElementById('answer-input');
    if (ansInput) ansInput.value = '';
  }

  let qStat = globalStatus.questionStatus[q.ID];
  if ((qStat && qStat.solvers.includes(playerName)) || localStorage.getItem(`cleared_${q.ID}`)) {
    document.getElementById('detail-title').innerText += " 【クリア済】";
    document.getElementById('submit-btn').style.display = 'none';
  } else {
    document.getElementById('submit-btn').style.display = 'block';
  }

  showScreen('detail-screen');
  updateUI();
}

function renderMultiProgress(qId, required) {
  const solvedGroups = JSON.parse(localStorage.getItem(`multi_${qId}`) || "[]");
  const solvedNames = JSON.parse(localStorage.getItem(`multi_names_${qId}`) || "[]");
  document.getElementById('multi-progress').innerText = `現在の正解: ${solvedGroups.length} / ${required} 人`;
  
  const listDiv = document.getElementById('multi-solved-list');
  if (solvedNames.length > 0) {
    listDiv.innerHTML = "正解済み: " + solvedNames.join(', ');
    listDiv.style.display = 'block';
  } else {
    listDiv.style.display = 'none';
  }
}

function updateUI() {
  if (!currentQuestionId) return;
  const q = questionsData.find(item => item.ID === currentQuestionId);
  if (!q) return;

  const now = new Date(new Date().getTime() + serverTimeOffset);
  const dynTextDiv = document.getElementById('detail-dynamic-text');
  const mediaDiv = document.getElementById('detail-media');
  
  let solvedCount = globalStatus.solved[playerName] || 0;
  let showDynamic = false;

  if (q.Config && q.Config.type) {
    if (q.Config.type === 'progressive') {
      const elapsedSec = Math.floor((now - new Date(q.Config.startTime)) / 1000);
      let revealCount = 1; 
      if (elapsedSec >= 0) revealCount += Math.floor(elapsedSec / q.Config.intervalSec);
      
      let html = "";
      for (let i = 0; i < Math.min(revealCount, q.Config.hints.length); i++) { html += q.Config.hints[i] + "<br>"; }
      dynTextDiv.innerHTML = html;
      if (html) showDynamic = true;
    } 
    // ⬇⬇ 今回追加する「replace_hint（時間でヒントが入れ替わる）」機能 ⬇⬇
    else if (q.Config.type === 'replace_hint') {
      const elapsedSec = Math.floor((now - new Date(q.Config.startTime)) / 1000);
      let phaseIndex = 0; // 開始時刻までは0番目（最初のヒント）を表示
      if (elapsedSec >= 0) {
        phaseIndex = Math.floor(elapsedSec / q.Config.intervalSec);
      }
      if (phaseIndex >= q.Config.hints.length) {
        phaseIndex = q.Config.hints.length - 1; // 最後のヒントに達したらそこで止める
      }
      
      if (phaseIndex >= 0 && q.Config.hints[phaseIndex]) {
        dynTextDiv.innerHTML = q.Config.hints[phaseIndex].replace(/\n/g, '<br>');
        showDynamic = true;
      }
    }
    // ⬆⬆ ここまで ⬆⬆
    else if (q.Config.type === 'solve_dependent') {
      let html = `<span style="color:#aaa; font-weight:normal;">現在のあなたの正解数: ${solvedCount}</span><br><br>`;
      q.Config.hints.forEach(hint => {
        if (solvedCount >= hint.req) html += hint.text + "<br>";
        else html += `<span style="color:#777; font-size:12px;">※正解数${hint.req}で解放</span><br>`;
      });
      dynTextDiv.innerHTML = html;
      showDynamic = true;
    } 
    else if (q.Config.type === 'time_dependent') {
      const elapsedSec = Math.floor((now - new Date(q.Config.startTime)) / 1000);
      let phaseIndex = elapsedSec > 0 ? Math.floor(elapsedSec / q.Config.intervalSec) : 0;
      if (phaseIndex >= q.Config.phases.length) phaseIndex = q.Config.phases.length - 1;
      if (phaseIndex >= 0) {
        dynTextDiv.innerHTML = q.Config.phases[phaseIndex].text.replace(/\n/g, '<br>');
        showDynamic = true;
      }
    } 
    else if (q.Config.type === 'guerrilla') {
      if (now >= new Date(q.Config.revealTime)) {
        dynTextDiv.innerText = q.Config.hiddenText;
        showDynamic = true;
      }
    } 
    else if (q.Config.type === 'mondo') {
      const elapsedSec = Math.floor((now - new Date(q.Config.startTime)) / 1000);
      let revealedCount = 0;
      if (elapsedSec >= 0) revealedCount = Math.floor(elapsedSec / q.Config.intervalSec) + 1;
      
      let displayText = Array(q.Config.text.length).fill('■');
      for (let i = 0; i < revealedCount && i < q.Config.order.length; i++) {
        const charIndex = q.Config.order[i];
        if (charIndex !== undefined && charIndex < displayText.length) {
          displayText[charIndex] = q.Config.text[charIndex];
        }
      }
      dynTextDiv.innerText = displayText.join('');
      showDynamic = true;
    }

    if (q.Config.hintTime && now >= new Date(q.Config.hintTime) && q.Config.hintMedia) {
      const hintContainer = mediaDiv.querySelector('#hint-media-container');
      if (hintContainer && hintContainer.innerHTML === '') {
        hintContainer.innerHTML = q.Config.hintMedia;
        mediaDiv.style.display = 'block';
      }
    }
  }

  if (dynTextDiv) {
    if (showDynamic) {
      dynTextDiv.style.display = 'block';
    } else {
      dynTextDiv.style.display = 'none';
      dynTextDiv.innerHTML = '';
    }
  }

  const lastMistakeTime = localStorage.getItem(`mistake_${q.ID}`);
  const btn = document.getElementById('submit-btn');
  const msg = document.getElementById('cooltime-message');
  
  let qStat = globalStatus.questionStatus[q.ID];
  let isCleared = (qStat && qStat.solvers.includes(playerName)) || localStorage.getItem(`cleared_${q.ID}`);

  if (lastMistakeTime && !isCleared) {
    const penaltyEnd = new Date(parseInt(lastMistakeTime) + (q.CoolTime * 1000));
    if (now < penaltyEnd) {
      const remain = Math.ceil((penaltyEnd - now) / 1000);
      if (btn) btn.disabled = true;
      if (msg) msg.innerText = `クールタイム中: 残り ${remain} 秒`;
    } else {
      if (btn) btn.disabled = false;
      if (msg) msg.innerText = "";
    }
  } else {
    if (btn) btn.disabled = false;
    if (msg) msg.innerText = "";
  }
}

async function submitAnswer() {
  const q = questionsData.find(item => item.ID === currentQuestionId);
  const btn = document.getElementById('submit-btn');
  
  if (q.Config && q.Config.type === 'multi') {
    const singleAns = document.getElementById('multi-single-input').value.trim();
    if (!singleAns) return;
    
    btn.disabled = true;
    try {
      const res = await fetch(GAS_URL, {
        method: "POST", body: JSON.stringify({ playerName, questionId: currentQuestionId, answer: singleAns, checkPart: true })
      });
      const result = await res.json();
      
      if (result.isCorrect) {
        let solvedGroups = JSON.parse(localStorage.getItem(`multi_${q.ID}`) || "[]");
        let solvedNames = JSON.parse(localStorage.getItem(`multi_names_${q.ID}`) || "[]");
        
        if (solvedGroups.includes(result.matchedGroup)) {
          alert("既に解答済みのメンバーです！");
          btn.disabled = false;
          return;
        }
        
        solvedGroups.push(result.matchedGroup);
        solvedNames.push(singleAns);
        localStorage.setItem(`multi_${q.ID}`, JSON.stringify(solvedGroups));
        localStorage.setItem(`multi_names_${q.ID}`, JSON.stringify(solvedNames));
        
        renderMultiProgress(q.ID, q.Config.required);
        document.getElementById('multi-single-input').value = '';
        
        if (solvedGroups.length >= q.Config.required) {
          const finalAns = solvedNames.join(',');
          const resFinal = await fetch(GAS_URL, {
            method: "POST", body: JSON.stringify({ playerName, questionId: currentQuestionId, answer: finalAns })
          });
          const resultFinal = await resFinal.json();
          
          localStorage.setItem(`cleared_${currentQuestionId}`, "true"); 
          alert(resultFinal.isFirstBlood ? "1st正解です！おめでとうございます！" : "クリア！");
          showHomeScreen();
        } else {
           alert("正解！");
           btn.disabled = false;
        }
      } else { handleMistake(q.ID); }
    } catch (e) { alert("通信エラーが発生しました"); btn.disabled = false; }
  } else {
    const answerStr = document.getElementById('answer-input').value.trim();
    if (!answerStr) return;

    // ⬇⬇ 五十音順の前・後判定ギミックのみ追加 ⬇⬇
    if (q.Config && q.Config.type === 'gojuon_high_low') {
      const targetStr = q.Config.target;
      
      if (answerStr !== targetStr) {
        const compareResult = answerStr.localeCompare(targetStr, 'ja');
        let hintMsg = "";
        if (compareResult < 0) {
          hintMsg = `五十音順で「${answerStr}」より【後】です`;
        } else if (compareResult > 0) {
          hintMsg = `五十音順で「${answerStr}」より【前】です`;
        }
        handleMistake(q.ID, hintMsg);
        return; 
      }
    }
    // ⬆⬆ ここまで ⬆⬆

    btn.disabled = true;
    try {
      const res = await fetch(GAS_URL, {
        method: "POST", body: JSON.stringify({ playerName, questionId: currentQuestionId, answer: answerStr })
      });
      const result = await res.json();
      if (result.isCorrect) {
        localStorage.setItem(`cleared_${currentQuestionId}`, "true"); 
        alert(result.isFirstBlood ? "1st正解です！おめでとうございます！" : "正解です！");
        showHomeScreen();
      } else { handleMistake(q.ID); }
    } catch (e) { alert("通信エラーが発生しました"); btn.disabled = false; }
  }
}

// エラーメッセージにヒントを追加表示するための修正
function handleMistake(id, customMsg) {
  if (customMsg) {
    alert("不正解...\n💡ヒント: " + customMsg);
  } else {
    alert("不正解...");
  }
  localStorage.setItem(`mistake_${id}`, new Date().getTime());
  if (document.getElementById('answer-input')) document.getElementById('answer-input').value = '';
  if (document.getElementById('multi-single-input')) document.getElementById('multi-single-input').value = '';
  updateUI();
}

function openModal(imgSrc) {
  document.getElementById('modal-img').src = imgSrc;
  document.getElementById('image-modal').style.display = "block";
}
function closeModal() { document.getElementById('image-modal').style.display = "none"; }
