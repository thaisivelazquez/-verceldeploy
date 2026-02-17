'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase/client'

export default function Page() {
    const [user, setUser] = useState<any>(null)
    const [tables, setTables] = useState<any[]>([])
    const [showTables, setShowTables] = useState(false)


    useEffect(() => {
        const getSession = async () => {
            const { data: { session } } = await supabase.auth.getSession()
            setUser(session?.user ?? null)
        }
        getSession()


        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null)
        })

        return () => subscription.unsubscribe()
    }, [])


    const loginWithGoogle = async () => {
        await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}/auth/callback`,
                queryParams: {
                    prompt: 'select_account',
                },
            },
        })
    }

    const handleLogout = async () => {
        await supabase.auth.signOut()
        setUser(null)
        setShowTables(false)

    }

    const fetchTables = async () => {
        const { data, error } = await supabase
            .from('caption_examples')
            .select('*')

        if (error) {
            console.error('Error fetching tables:', error)
            return
        }

        setTables(data ?? [])
        setShowTables(true)
    }


    if (!user) {
        return (
            <div style={centeredContainerStyle}>
                <div style={{ textAlign: 'center' }}>
                    <h2 style={{ marginBottom: '20px' }}>Assignment #3: Protected Route</h2>
                    <button
                        onClick={loginWithGoogle}
                        style={{ ...buttonStyle, backgroundColor: '#4285F4' }}
                    >
                        Sign in with Google
                    </button>
                </div>
            </div>
        )
    }


    if (!showTables) {
        return (
            <div style={centeredContainerStyle}>
                <div style={{ textAlign: 'center' }}>
                    <p style={{ marginBottom: '10px' }}>Logged in as: {user.email}</p>
                    <button onClick={fetchTables} style={buttonStyle}>
                        Hello World
                    </button>
                    <br />
                    <button onClick={handleLogout} style={logoutLinkStyle}>
                        Sign Out
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h1>caption_examples tables</h1>
                <button onClick={handleLogout} style={logoutButtonStyle}>Sign Out</button>
            </div>

            <table style={tableStyle}>
                <thead>
                <tr style={{ backgroundColor: '#f3f4f6' }}>
                    <th style={headerCellStyle}>ID</th>
                    <th style={headerCellStyle}>Created Date</th>
                    <th style={headerCellStyle}>Modified Date</th>
                    <th style={headerCellStyle}>Description</th>
                    <th style={headerCellStyle}>Caption</th>
                    <th style={headerCellStyle}>Explanation</th>
                    <th style={headerCellStyle}>Priority</th>
                    <th style={headerCellStyle}>Image ID</th>
                </tr>
                </thead>
                <tbody>
                {tables.map((table: any) => (
                    <tr key={table.id} style={rowStyle}>
                        <td style={cellStyle}>{table.id}</td>
                        <td style={cellStyle}>{formatDate(table.created_datetime_utc)}</td>
                        <td style={cellStyle}>{formatDate(table.modified_created_datetime_utc)}</td>
                        <td style={cellStyle}>{table.image_description}</td>
                        <td style={cellStyle}>{table.caption}</td>
                        <td style={cellStyle}>{table.explanation}</td>
                        <td style={cellStyle}>
                            <PriorityBadge priority={table.priority} />
                        </td>
                        <td style={cellStyle}>{table.image_id}</td>
                    </tr>
                ))}
                </tbody>
            </table>
        </div>
    )
}



const centeredContainerStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    flexDirection: 'column'
}

const buttonStyle: React.CSSProperties = {
    padding: '12px 24px',
    fontSize: '18px',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
}

const logoutButtonStyle: React.CSSProperties = {
    padding: '8px 16px',
    backgroundColor: '#6b7280',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer'
}

const logoutLinkStyle: React.CSSProperties = {
    marginTop: '20px',
    background: 'none',
    border: 'none',
    color: '#ef4444',
    textDecoration: 'underline',
    cursor: 'pointer'
}

const tableStyle: React.CSSProperties = {
    width: '100%',
    borderCollapse: 'separate',
    borderSpacing: '0 10px',
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
}

const rowStyle: React.CSSProperties = {
    backgroundColor: '#fff',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    borderRadius: '8px',
}

const headerCellStyle: React.CSSProperties = {
    textAlign: 'left',
    padding: '12px 15px',
    fontWeight: 600,
    color: '#374151',
    fontSize: '14px',
    borderBottom: '2px solid #e5e7eb',
}

const cellStyle: React.CSSProperties = {
    padding: '12px 15px',
    verticalAlign: 'top',
    fontSize: '14px',
    color: '#4b5563',
    maxWidth: '200px',
    overflowWrap: 'break-word',
}

function formatDate(dateStr: string) {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    })
}

function PriorityBadge({ priority }: { priority: any }) {
    let bgColor = '#d1fae5'
    let textColor = '#065f46'
    if (priority === 'high') { bgColor = '#fee2e2'; textColor = '#b91c1c' }
    else if (priority === 'medium') { bgColor = '#fef3c7'; textColor = '#a16207' }

    return (
        <span style={{
            backgroundColor: bgColor, color: textColor,
            padding: '4px 8px', borderRadius: '12px',
            fontWeight: 600, fontSize: '12px',
            display: 'inline-block', minWidth: '60px', textAlign: 'center',
        }}>
            {priority ?? '-'}
        </span>
    )
}