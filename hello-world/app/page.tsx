'use client'

import { supabase } from '../lib/supabase/client'
import React, { useState, useEffect, useMemo } from 'react'
import styles from './Page.module.css'

export default function Page() {
    const [user, setUser] = useState<any>(null)
    const [captions, setCaptions] = useState<any[]>([])
    const [activeTab, setActiveTab] = useState<'Rating' | 'Upload'>('Rating')
    const [page, setPage] = useState(0)
    const [votedIds, setVotedIds] = useState<Set<string>>(new Set())
    const [votes, setVotes] = useState<Record<string, number>>({})
    const [noMoreCaptions, setNoMoreCaptions] = useState(false)
    const [loadingCaptions, setLoadingCaptions] = useState(true)

    const [uploadProgress, setUploadProgress] = useState(0)
    const [selectedFile, setSelectedFile] = useState<File | null>(null)
    const [uploadedFileName, setUploadedFileName] = useState<string | null>(null)
    const [uploading, setUploading] = useState(false)
    const [uploadSuccess, setUploadSuccess] = useState(false)

    const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null)
    const [uploadedCaptions, setUploadedCaptions] = useState<
        { id: string; caption: string; content: string }[]
    >([])
    const [uploadedCaptionIndex, setUploadedCaptionIndex] = useState(0)
    const [savedCaptionIds, setSavedCaptionIds] = useState<Set<string>>(new Set())

    const [showUploads, setShowUploads] = useState(false)
    const [myUploadedImages, setMyUploadedImages] = useState<
        { entryId: string; imageUrl: string; caption: string; saved: boolean }[]
    >([])
    const [loadingUploads, setLoadingUploads] = useState(false)

    const ITEMS_PER_PAGE = 500
    const DISPLAY_LIMIT = 8



    useEffect(() => {
        const getSession = async () => {
            const { data: { session } } = await supabase.auth.getSession()
            setUser(session?.user ?? null)
        }
        getSession()
        const { data: { subscription } } =
            supabase.auth.onAuthStateChange((_event, session) => {
                setUser(session?.user ?? null)
            })
        return () => subscription.unsubscribe()
    }, [])



    useEffect(() => {
        if (!user) return
        const loadVotedIds = async () => {
            const localKey = `voted_${user.id}`
            const localVoted: string[] = JSON.parse(localStorage.getItem(localKey) ?? '[]')
            const { data } = await supabase
                .from('caption_votes')
                .select('caption_id')
                .eq('profile_id', user.id)
            const dbVoted = data?.map((r: any) => r.caption_id) ?? []
            const merged = new Set([...localVoted, ...dbVoted])
            setVotedIds(merged)
            localStorage.setItem(localKey, JSON.stringify([...merged]))
        }
        loadVotedIds()
    }, [user])



    useEffect(() => {
        if (activeTab === 'Rating' && user) loadRatingData()
    }, [activeTab, page, user])

    useEffect(() => {
        if (
            captions.length > 0 &&
            votedIds.size > 0 &&
            captions.every(c => votedIds.has(c.id))
        ) {
            setPage(p => p + 1)
        }
    }, [captions, votedIds])

    const loadRatingData = async () => {
        setLoadingCaptions(true)
        const captionsData = await fetchCaptions(page)
        if (!captionsData?.length) {
            setNoMoreCaptions(true)
            setLoadingCaptions(false)
            return
        }
        await fetchVoteTotals(captionsData.map((c: any) => c.id))
        setLoadingCaptions(false)
    }

    const fetchCaptions = async (currentPage: number) => {
        const from = currentPage * ITEMS_PER_PAGE
        const to = from + ITEMS_PER_PAGE - 1
        const { data, error } = await supabase
            .from('captions')
            .select('*, images(url)')  // ← join images table to get URL
            .range(from, to)
            .order('id', { ascending: true })
        if (error) return []
        if (!data?.length) return []

        const unvoted = data.filter((c: any) => !votedIds.has(c.id))
        if (!unvoted.length) {
            setPage(p => p + 1)
            return []
        }

        const shuffled = [...unvoted].sort(() => Math.random() - 0.5)
        setCaptions(shuffled)
        return shuffled
    }

    const fetchVoteTotals = async (captionIds: string[]) => {
        if (!captionIds.length) return
        const { data } = await supabase
            .from('caption_votes')
            .select('caption_id, vote_value')
            .in('caption_id', captionIds)
        const totals: Record<string, number> = {}
        data?.forEach((row: any) => {
            totals[row.caption_id] = (totals[row.caption_id] ?? 0) + row.vote_value
        })
        setVotes(totals)
    }



    const saveCaption = (userId: string, imageUrl: string, captionId: string, captionText: string) => {
        const key = `saved_${userId}`
        const existing: any[] = JSON.parse(localStorage.getItem(key) ?? '[]')
        if (!existing.find((e: any) => e.entryId === captionId)) {
            existing.unshift({ entryId: captionId, imageUrl, caption: captionText, saved: true })
            localStorage.setItem(key, JSON.stringify(existing))
        }
        setSavedCaptionIds(prev => new Set([...prev, captionId]))
    }

    const loadMyUploads = () => {
        if (!user) return
        setLoadingUploads(true)
        const key = `saved_${user.id}`
        const stored: { entryId: string; imageUrl: string; caption: string; saved: boolean }[] =
            JSON.parse(localStorage.getItem(key) ?? '[]')
        setMyUploadedImages(stored)
        setLoadingUploads(false)
    }

    const handleOpenUploads = () => {
        setShowUploads(true)
        loadMyUploads()
    }

    const handleSaveCaption = () => {
        if (!user || !uploadedImageUrl || uploadedCaptions.length === 0) return
        const current = uploadedCaptions[uploadedCaptionIndex]
        saveCaption(user.id, uploadedImageUrl, current.id, current.caption || current.content)
    }


    const handleFileUpload = async () => {
        if (!user || !selectedFile) return
        const file = selectedFile
        try {
            setUploading(true)
            setUploadProgress(10)
            setUploadSuccess(false)
            setUploadedCaptions([])
            setUploadedCaptionIndex(0)
            setUploadedImageUrl(null)
            setSavedCaptionIds(new Set())

            const { data: { session } } = await supabase.auth.getSession()
            const token = session?.access_token
            if (!token) throw new Error('No auth token')

            const presignRes = await fetch(
                'https://api.almostcrackd.ai/pipeline/generate-presigned-url',
                {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contentType: file.type })
                }
            )
            if (!presignRes.ok) throw new Error('Failed to generate presigned URL')
            const { presignedUrl, cdnUrl } = await presignRes.json()
            setUploadProgress(30)

            const uploadRes = await fetch(presignedUrl, {
                method: 'PUT',
                headers: { 'Content-Type': file.type },
                body: file
            })
            if (!uploadRes.ok) throw new Error('Failed to upload to S3')
            setUploadProgress(60)

            const registerRes = await fetch(
                'https://api.almostcrackd.ai/pipeline/upload-image-from-url',
                {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ imageUrl: cdnUrl, isCommonUse: false })
                }
            )
            if (!registerRes.ok) throw new Error('Failed to register image')
            const { imageId } = await registerRes.json()
            setUploadProgress(80)

            const captionRes = await fetch(
                'https://api.almostcrackd.ai/pipeline/generate-captions',
                {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ imageId })
                }
            )
            if (!captionRes.ok) throw new Error('Failed to generate captions')
            const generatedCaptions = await captionRes.json()
            setUploadProgress(100)

            if (Array.isArray(generatedCaptions)) {
                const rows = generatedCaptions.map((c: any) => ({
                    id: c.id,
                    caption: c.caption,
                    content: c.content,
                    image_id: imageId,
                    created_datetime_utc: new Date().toISOString(),
                    modified_datetime_utc: new Date().toISOString()
                }))
                await supabase.from('captions').insert(rows)
                const mapped = generatedCaptions.map((c: any) => ({
                    id: c.id, caption: c.caption, content: c.content
                }))
                setUploadedCaptions(mapped)
                setUploadedCaptionIndex(0)
                setUploadedImageUrl(cdnUrl)
            }

            setUploadSuccess(true)
        } catch (err) {
            console.error(err)
            alert('Upload & caption generation failed')
        } finally {
            setUploading(false)
        }
    }

    const deleteUploadedImage = async () => {
        if (!uploadedFileName) {
            setSelectedFile(null)
            setUploadProgress(0)
            setUploadSuccess(false)
            setUploadedImageUrl(null)
            setUploadedCaptions([])
            setUploadedCaptionIndex(0)
            setSavedCaptionIds(new Set())
            return
        }
        try {
            await supabase.storage.from('images').remove([uploadedFileName])
            setSelectedFile(null)
            setUploadedFileName(null)
            setUploadProgress(0)
            setUploadSuccess(false)
            setUploadedImageUrl(null)
            setUploadedCaptions([])
            setUploadedCaptionIndex(0)
            setSavedCaptionIds(new Set())
        } catch (err) {
            console.error(err)
            alert('Failed to delete image')
        }
    }



    const submitVote = async (vote_value: number, caption_id: string) => {
        if (!user) return
        if (votedIds.has(caption_id)) return
        await supabase.from('caption_votes').insert([{
            created_datetime_utc: new Date().toISOString(),
            modified_datetime_utc: new Date().toISOString(),
            profile_id: user.id,
            caption_id,
            vote_value
        }])
        const localKey = `voted_${user.id}`
        const existing: string[] = JSON.parse(localStorage.getItem(localKey) ?? '[]')
        if (!existing.includes(caption_id)) {
            existing.push(caption_id)
            localStorage.setItem(localKey, JSON.stringify(existing))
        }
    }

    const validCaptions = useMemo(
        () => captions.filter(c => c.images?.url && (c.caption || c.content || c.text || '').trim().length > 0),
        [captions]
    )

    const displayedCaptions = useMemo(
        () => validCaptions.filter(c => !votedIds.has(c.id)).slice(0, DISPLAY_LIMIT),
        [validCaptions, votedIds]
    )

    const isExhausted = useMemo(
        () => noMoreCaptions && displayedCaptions.length === 0 && !loadingCaptions,
        [noMoreCaptions, displayedCaptions, loadingCaptions]
    )

    const handleVote = (value: number, id: string) => {
        if (votedIds.has(id)) return
        submitVote(value, id)
        setVotes(prev => ({ ...prev, [id]: (prev[id] ?? 0) + value }))
        setVotedIds(prev => new Set([...prev, id]))
    }



    if (!user) {
        return (
            <div className={styles.appBackground}>
                <div className={styles.centeredContainer}>
                    <div className={styles.centeredInner}>
                        <h2 className={styles.pageTitle}>Welcome to caption rating</h2>
                        <button
                            onClick={() =>
                                supabase.auth.signInWithOAuth({
                                    provider: 'google',
                                    options: { redirectTo: `${window.location.origin}/auth/callback` },
                                })
                            }
                            className={styles.button}
                        >
                            Sign in with Google
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    const currentCaption = uploadedCaptions[uploadedCaptionIndex]
    const currentIsSaved = currentCaption ? savedCaptionIds.has(currentCaption.id) : false

    return (
        <div className={styles.appBackground}>
            <Navbar
                user={user}
                onLogout={async () => { await supabase.auth.signOut(); setUser(null) }}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                onEmailClick={handleOpenUploads}
            />

            {showUploads && (
                <div className={styles.modalOverlay} onClick={() => setShowUploads(false)}>
                    <div className={styles.modalBox} onClick={e => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>My Saved Captions</h2>
                            <button className={styles.modalClose} onClick={() => setShowUploads(false)}>✕</button>
                        </div>
                        {loadingUploads ? (
                            <p className={styles.modalEmpty}>Loading...</p>
                        ) : myUploadedImages.length === 0 ? (
                            <p className={styles.modalEmpty}>No saved captions yet. Upload a photo and save a caption!</p>
                        ) : (
                            <div className={styles.modalGrid}>
                                {myUploadedImages.map(({ entryId, imageUrl, caption }) => (
                                    <div key={entryId} className={styles.modalCard}>
                                        <div className={styles.modalImageWrapper}>
                                            <img src={imageUrl} className={styles.modalImage} alt="" />
                                        </div>
                                        <div className={styles.modalCardBody}>
                                            <p className={styles.modalCaptionText}>"{caption}"</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'Rating' ? (
                <div className={styles.pageWrapperCentered}>
                    <h1 className={styles.pageTitle}>Rate Captions</h1>

                    {isExhausted ? (
                        <div className={styles.noMoreState}>
                            <p className={styles.noMoreEmoji}>🎉</p>
                            <h2 className={styles.noMoreTitle}>No New Memes</h2>
                            <p className={styles.noMoreSub}>You've rated everything. Check back later!</p>
                        </div>
                    ) : loadingCaptions && displayedCaptions.length === 0 ? (
                        <div className={styles.noMoreState}>
                            <p className={styles.noMoreEmoji}>⏳</p>
                            <p className={styles.noMoreSub}>Loading captions...</p>
                        </div>
                    ) : (
                        <div className={styles.ratingGrid}>
                            {displayedCaptions.map((caption) => (
                                <div key={caption.id} className={styles.ratingCard}>
                                    <div className={styles.ratingImageWrapper}>
                                        <img
                                            src={caption.images?.url}
                                            className={styles.ratingImage}
                                            alt=""
                                        />
                                    </div>
                                    <div className={styles.ratingCardBody}>
                                        <p className={styles.ratingCaption}>
                                            {caption.caption || caption.content || caption.text || 'No caption'}
                                        </p>
                                        <div className={styles.ratingFooter}>
                                            <span className={styles.ratingScore}>
                                                ★ {votes[caption.id] ?? 0}
                                            </span>
                                            <div className={styles.ratingButtons}>
                                                <button className={styles.upvoteBtn} onClick={() => handleVote(1, caption.id)}>▲</button>
                                                <button className={styles.downvoteBtn} onClick={() => handleVote(-1, caption.id)}>▼</button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                <div className={styles.pageWrapperCentered}>
                    <h1 className={styles.pageTitle}>Upload Your Photos to Generate your Captions</h1>

                    {uploadSuccess && uploadedImageUrl && uploadedCaptions.length > 0 ? (
                        <div className={styles.uploadPreviewSection}>
                            <div className={`${styles.ratingCard} ${styles.uploadPreviewCard}`}>
                                <div className={styles.ratingImageWrapper}>
                                    <img src={uploadedImageUrl} alt="Uploaded" className={styles.ratingImage} />
                                </div>
                                <div className={styles.ratingCardBody}>
                                    <p className={styles.ratingCaption}>
                                        "{currentCaption?.caption || currentCaption?.content}"
                                    </p>
                                    <div className={styles.ratingFooter}>
                                        <button
                                            type="button"
                                            className={currentIsSaved ? styles.saveButtonSaved : styles.saveButton}
                                            onClick={handleSaveCaption}
                                            disabled={currentIsSaved}
                                        >
                                            {currentIsSaved ? '✓ Saved' : '♡ Save'}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className={styles.captionCarouselControls}>
                                <button
                                    type="button"
                                    className={styles.carouselNavButton}
                                    onClick={() => setUploadedCaptionIndex(prev => prev === 0 ? uploadedCaptions.length - 1 : prev - 1)}
                                >
                                    ◀ Previous
                                </button>
                                <div className={styles.carouselDots}>
                                    {uploadedCaptions.map((c, idx) => (
                                        <button
                                            key={c.id}
                                            type="button"
                                            onClick={() => setUploadedCaptionIndex(idx)}
                                            className={`${styles.carouselDot} ${idx === uploadedCaptionIndex ? styles.carouselDotActive : ''} ${savedCaptionIds.has(c.id) ? styles.carouselDotSaved : ''}`}
                                        />
                                    ))}
                                </div>
                                <button
                                    type="button"
                                    className={styles.carouselNavButton}
                                    onClick={() => setUploadedCaptionIndex(prev => prev === uploadedCaptions.length - 1 ? 0 : prev + 1)}
                                >
                                    Next ▶
                                </button>
                            </div>

                            <button
                                type="button"
                                onClick={() => {
                                    setSelectedFile(null)
                                    setUploadProgress(0)
                                    setUploadSuccess(false)
                                    setUploadedImageUrl(null)
                                    setUploadedCaptions([])
                                    setUploadedCaptionIndex(0)
                                    setUploadedFileName(null)
                                    setSavedCaptionIds(new Set())
                                }}
                                className={styles.navLogout}
                            >
                                Upload Another Photo
                            </button>
                        </div>
                    ) : (
                        <>
                            <div
                                className={styles.uploadCard}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => {
                                    e.preventDefault()
                                    const file = e.dataTransfer.files?.[0]
                                    if (file) {
                                        setSelectedFile(file)
                                        setUploadProgress(0)
                                        setUploadSuccess(false)
                                        setUploadedImageUrl(null)
                                        setUploadedCaptions([])
                                        setUploadedCaptionIndex(0)
                                    }
                                }}
                            >
                                <div className={styles.uploadDropzone}>
                                    <p className={styles.uploadTitle}>
                                        Drop your image here, or <span className={styles.uploadBrowse}>browse</span>
                                    </p>
                                    <p className={styles.uploadSubtext}>Supports: JPEG, JPG, PNG, WEBP, GIF and HEIC</p>
                                    <input
                                        type="file"
                                        accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/heic"
                                        className={styles.uploadInput}
                                        onChange={(e) => {
                                            const file = e.target.files?.[0]
                                            if (file) {
                                                setSelectedFile(file)
                                                setUploadProgress(0)
                                                setUploadSuccess(false)
                                                setUploadedImageUrl(null)
                                                setUploadedCaptions([])
                                                setUploadedCaptionIndex(0)
                                            }
                                        }}
                                    />
                                </div>

                                {selectedFile && (
                                    <>
                                        <div className={styles.fileRow}>
                                            <div className={styles.fileLeft}>
                                                <div className={styles.fileAvatar}>
                                                    {selectedFile.name.charAt(0).toUpperCase()}
                                                </div>
                                                <div className={styles.fileMeta}>
                                                    <div className={styles.fileName}>
                                                        {selectedFile.name}{' '}
                                                        <span className={styles.fileAttached}>· attached</span>
                                                    </div>
                                                    <div className={styles.fileSize}>
                                                        {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
                                                    </div>
                                                </div>
                                            </div>
                                            <div className={styles.fileRight}>
                                                <button
                                                    className={styles.deleteIconButton}
                                                    type="button"
                                                    onClick={deleteUploadedImage}
                                                    disabled={uploading}
                                                >✕</button>
                                            </div>
                                        </div>
                                        <div className={styles.progressBarOuter}>
                                            <div className={styles.progressBarInner} style={{ width: `${uploadProgress}%` }} />
                                        </div>
                                    </>
                                )}
                            </div>

                            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>
                                <button
                                    type="button"
                                    onClick={handleFileUpload}
                                    className={styles.navLogout}
                                    disabled={!selectedFile || uploading}
                                >
                                    {uploading ? 'Uploading...' : 'Submit & Generate Captions'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    )
}



function Navbar({ user, onLogout, activeTab, setActiveTab, onEmailClick }: any) {
    const items: ('Rating' | 'Upload')[] = ['Rating', 'Upload']
    return (
        <div className={styles.navbar}>
            <div className={styles.navInner}>
                <div
                    className={styles.navIndicator}
                    style={{ transform: activeTab === 'Rating' ? 'translateX(0%)' : 'translateX(100%)' }}
                />
                {items.map((item) => (
                    <button
                        key={item}
                        onClick={() => setActiveTab(item)}
                        className={`${styles.navItem} ${activeTab === item ? styles.navItemActive : ''}`}
                    >
                        {item}
                    </button>
                ))}
            </div>
            <div className={styles.navRight}>
                <button className={styles.navEmailButton} onClick={onEmailClick}>
                    {user?.email}
                </button>
                <button onClick={onLogout} className={styles.navLogout}>Sign Out</button>
            </div>
        </div>
    )
}
