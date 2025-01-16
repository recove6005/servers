import path from 'path';
import { fileURLToPath } from 'url';
import { db, auth } from "../public/firebase-config.js";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from "firebase/auth";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 이메일 인증 체크
export const checkUserVerify = async (req, res) => {
    if(req.session.user) {
        const user = auth.currentUser;
        if(!user.emailVerified) {
            try {
                await sendEmailVerification(user);
                req.session.destroy((err) => {
                    if (err) {
                        console.error("Failed to destroy session:", err);
                        // 에러 응답
                        if (!res.headersSent) {
                            return res.status(500).send({ error: "Failed to destroy session" });
                        }
                    }

                    // 세션 쿠키 삭제 및 응답 전송
                    if (!res.headersSent) {
                        res.clearCookie("connect.sid");
                        return res.status(200).send({ msg: "verify0"});
                    }
                });
            } catch(e) {
                console.error("Error sending verification email:", e);
                // 에러 응답
                if (!res.headersSent) {
                    return res.status(500).send({ error: "Failed to send verification email" });
                }
            }
        } else {
            // 이메일 인증이 이미 완료된 경우
            if (!res.headersSent) {
                // verify가 false이면 true로 업데이트
                const usersDocRef = doc(db, "users", user.email);
                const usersDocSnap = await getDoc(usersDocRef);

                if(usersDocSnap.exists()) {
                    const verifyData = usersDocSnap.data().verify;
                    if(verifyData == false) {
                        console.log(`verify update : ${verifyData}`);
                        await updateDoc(doc(db, "users", user.email), {
                            email: user.email,
                            uid: user.uid,
                            verify: true,
                            subscribe: '0',
                            admin: false,
                        });
                    }
                } else {
                    console.log("No Firebase user session.");
                    return res.status(401).send({ error: "No Firebase session found." });
                }

                // 계정 구독권 데이터 셋 생성
                const subscribeDocRef = doc(db, "subscribes", user.email);
                const subscribeDocSnap = await getDoc(subscribeDocRef);
                if(!subscribeDocSnap.exists()) {
                    console.log("subscribe create.");
                    await setDoc(doc(db, "subscribes", user.email), {
                        email: user.email,
                        uid: user.uid,
                        type: '0',
                        logo: 0,
                        draft: 0,
                        signage: 0,
                        blog: 0,
                        homepage: 0,
                        discount: 0,
                    });
                }

                return res.status(200).send({ msg: `${user.email}` });
            }
        } 
    } else {
        // 세션이 존재하지 않을 경우
        if (!res.headersSent) {
            return res.status(400).send({ msg: "세션이 존재하지 않습니다." });
        }
    }
}

export const moveToLoginEmail = (req, res) => {
    res.sendFile(path.join(__dirname, '../public/html/login-email.html'));
};

// 로그인
export const login = async (req, res) => {
    const { email, password } = req.body;

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        req.session.user = { email } // 세션 저장

        req.session.save(async (err) => {
            if (err) {
                console.error("Failed to save session:", err);
                return res.status(500).send({ error: "Failed to save session" });
            }

            res.status(200).send({
                message: "User account successfully created.",
                email: user.email,
                uid: user.uid,
             });
        });
    } catch (e) {
        if(e.code === 'auth/user-not-found') {
            // 유저 정보가 없음
            console.log(`${e.code}: ${e.message}`);
            res.status(404).send({code: e.code});
        }
        else if(e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
            // 잘못된 비밀번호
            console.log(`${e.code}: ${e.message}`);
            res.status(401).send({code: e.code});
        }
        else if(e.code === 'auth/too-many-requests') {
            // 여러 번의 로그인 실패로 요청이 차단됨
            console.log(`${e.code}: ${e.message}`);
            res.status(429).send({code: e.code});
        }
        else {
            console.log(`${e.code}: ${e.message}`);
            res.status(400).send({code: e.code});
        }
    }
};

// 회원가입
export const register = async (req, res) => {
    const { email, password } = req.body;

    await createUserWithEmailAndPassword(auth, email, password)
    .then(async (userCredential) => {
        const user = userCredential.user;
        
        // 계정 데이터셋 생성
        await setDoc(doc(db, "users", email), {
            email: email,
            uid: user.uid,
            verify: false,
            subscribe: '0',
            admin: false,
        });

        req.session.user = { email } // 세션 저장

        req.session.save((err) => {
            if (err) {
                console.error("Failed to save session:", err);
                return res.status(500).send({ error: "Failed to save session" });
            }

            res.status(200).send({
                message: "User account successfully created.",
                email: user.email,
             });
        });
    })
    .catch(async (e) => {
        res.status(400).send({ error: e.code });
    });
}

// 현재 유저 로그인 세션 정보 가져오기
export const getCurrentUser = async (req, res) => {
    if(req.session.user) {
        res.status(200).send(req.session.user);
    } else {
        res.status(401).send({ error: "No user is logged in."});
    }
};

// 로그아웃 
export const logout = async (req, res) => {
    console.log(`server logout.`);
    if(!req.session.user) {
        return res.status(401).send({ msg: "No session exist."});
    }

    try {
        req.session.destroy((e) => {
            if(e) {
                console.error("Session destroy error: ", err);
                return res.status(500)({ error: "Failed to destroy session."});
            }
        })

        res.clearCookie("connect.sid"); // 쿠키 삭제
        console.log("Session destroyed and cookie cleared.");

        const user = auth.currentUser;
        if(user) {
            signOut(auth)
            .then(() => {
                console.log("Firebase user signed out.");
                return res.status(200).send({ msg: "User logout successful." });
            })
            .catch((e) => {
                console.error("Firebase logout error:", e.message);
                return res.status(500).send({ error: e.message });
            });
        } else {
            console.log("No Firebase user session.");
            return res.status(200).send({ msg: "No Firebase session found, but logged out." });
        }
    } catch(e) {
        console.error("Logout error:", e.message);
        return res.status(500).send({ error: e.message });
    }
}

// admin check
export const checkAdmin = async (req, res) => {
    const user = auth.currentUser;
    if(user) {
        const docRef = doc(db, 'users', user.email);
        const docSnap = await getDoc(docRef);

        if(docSnap.exists()) {
            const admin = docSnap.data().admin;
            return res.status(200).send({ admin: admin });
        } else {
            return res.status(401).send({ error: "No admin data found. "});
        }
    } else {
        return res.status(400).send({ error: "No firebase user found. "});
    }
    
}

// password 재설정
export const updatePassword = async (req, res) => {
    if(req.session.user) {
        const user = auth.currentUser;
        if(user) {      
            const email = user.email;

            try {
                await sendPasswordResetEmail(auth, email)
                .then(() => {
                    return res.status(200).end();
                })
                .catch((error) => {
                    return res.status(500).json({ error: error.message });
                });
            } catch(e) {
                res.status(500).json({ error: e.message });
            }
        } else {
            return res.status(500).json({ error: 'No auth found.'});
        }
    }
}