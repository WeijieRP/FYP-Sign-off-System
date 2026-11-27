// Owner: Role 3, Jun Kai. Previous team: XY (Xuanyang) (8), Caeden (4), Nick (4).
// ============================================================
// DONE BY XY - EMAIL BADGE SERVICE SUMMARY
//  - Added the RP Xperience Centre Kiosk badge email system and badge configurations.
//  - Added topic-to-badge mapping for pledge topics selected in the feedback flow.
//  - Added customized HTML email templates with badge visuals.
//  - Added badge congratulation email sending and social sharing sections.
//  - Added admin-editable badge email template support.
//  - Active badge flow now uses Feedback Contributor plus 6 pledge-topic badges only.
//  - Visitors who skip pledge or submit no valid pledge topic receive Feedback Contributor.
//  - Added photo thank-you email visit summary card with visit date, pledge topic, badge, retention and digital tree message.
//  - Made visit summary card title, labels and tree message editable from admin email parameters.
//  - Find command: rg -n "XY CHANGE SUMMARY|DONE BY XY" frontend backend
// ============================================================

// ============================================================
// CAEDEN CHANGE SUMMARY (DONE BY CAEDEN)
// ============================================================
//
// 1. ADMIN-EDITABLE THANK YOU EMAIL CONTENT
//    const parametersConfigStore      - Load thank-you email content configured in admin panel (DONE BY CAEDEN)
//    function sendThankYouEmail       - Apply editable subject, intro, closing, sender and footer text (DONE BY CAEDEN)
//
// FIND COMMAND
//    rg -n "DONE BY CAEDEN|CAEDEN CHANGE SUMMARY" frontend backend
// ============================================================

const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const paths = require('../../core/paths');
const { plainName } = require('../../core/photoFiles'); // <Jun Kai/>
const { forLog, emailForLog } = require('../../core/log'); // <Jun Kai/> no line breaks from requests, emails masked
const { getEmailConfig } = require('./configStore');
const { getBadgeEmailTemplates } = require('./templateStore');
const parametersConfigStore = require('../parameters/store');

function getPhotoAttachmentContentType(filename) { // changes made by nick
    const extension = path.extname(String(filename || '')).toLowerCase();
    if (extension === '.gif') return 'image/gif';
    if (extension === '.png') return 'image/png';
    if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
    return 'application/octet-stream';
}

// ==================== BADGE SYSTEM IMPLEMENTATION ====================
// Done by XY - Complete badge awarding system for RP Xperience Centre Kiosk
//
// SUMMARY OF CHANGES:
// 1. Added comprehensive badge configurations with multiple dedicated badge types
// 2. Implemented explicit pledge topic selection and topic-to-badge mapping
// 3. Updated dynamic badge determination to prefer selected topic over keyword fallback
// 4. Created customized HTML email templates with image icons for each badge
// 5. Integrated badge email sending into feedback submission workflow
//
// BADGE TYPES:
// - Feedback Contributor: Default for completing feedback form
// - Climate Champion: For climate-related pledge topics
// - Renewable Innovator: For clean energy and renewable pledges
// - Sustainable Living Advocate: For sustainable lifestyle pledges
// - Ocean Guardian: For ocean conservation pledges
// - Governance Guardian: For ethics and governance pledges
// - Social Champion: For community and social impact pledges
// - Commitment Champion: Generic pledge badge when no explicit topic is selected
//
// TECHNICAL FEATURES:
// - Explicit topic selection from frontend pledge form
// - Topic badge mapping with dedicated badge assignment
// - Keyword fallback when no topic is selected
// - HTML email templates and badge-specific imagery
// - Badge email delivery integrated with feedback submission
//
// FILES MODIFIED:
// - backend/emailService.js: Added explicit topic badge mapping and updated badge configs
// - frontend/feedback/feedback.html: Added pledge topic selector
// - frontend/feedback/feedback.js: Captured selected topic and validated topic choice on submit
//
// INTEGRATION:
// - Selected pledge topic now determines the badge badge award
// - Topic selection is required before proceeding from the pledge page
// - Fallback keyword detection remains available for older pledge data
// ==================== BADGE CONFIGURATIONS ==================== Done by XY
const BADGE_CONFIGS = {
    'feedback-completer': {
        name: 'Feedback Contributor',
        description: 'For completing the feedback form',
        subject: 'Congratulations on Earning Your Feedback Contributor Badge!',
        icon: '📝',
        imageUrl: 'https://img.icons8.com/fluency/96/feedback.png',
        color: '#10b981',
        textTemplate: `Hello!\n\nCongratulations on completing the feedback form! You've earned the "Feedback Contributor" badge.\n\nKeep up the great work!\n\nBest regards,\nRP Xperience Centre Team`,
        htmlTemplate: `
            <div style="font-family: Arial, sans-serif; max-width:600px; margin:0 auto; background: #f8fafc; padding: 20px; border-radius: 10px;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <div style="width: 80px; height: 80px; margin: 0 auto 15px; background: #10b981; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);">
                        <img src="https://img.icons8.com/fluency/72/ffffff/feedback.png" alt="Feedback badge" style="width: 48px; height: 48px;" />
                    </div>
                    <div style="background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 15px 30px; border-radius: 50px; display: inline-block; box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);">
                        <h2 style="margin: 0; font-size: 24px;">Feedback Contributor</h2>
                        <p style="margin: 5px 0 0 0; opacity: 0.9;">Badge Earned!</p>
                    </div>
                </div>
                <div style="background: white; padding: 25px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                    <h3 style="color:#006937; margin-top: 0;">Congratulations!</h3>
                    <p>Hello!</p>
                    <p>Congratulations on completing the feedback form! You've earned the <strong>"Feedback Contributor"</strong> badge for sharing your valuable insights.</p>
                    <p>Your feedback helps us improve and serve you better. Keep up the great work!</p>
                    <div style="text-align: center; margin: 25px 0;">
                        <div style="display: inline-block; background: #10b981; color: white; padding: 10px 20px; border-radius: 20px; font-weight: bold;">
                            🏆 Achievement Unlocked
                        </div>
                    </div>
                    <p>Best regards,<br><strong>RP Xperience Centre Team</strong></p>
                    
                    <!-- Social Media Sharing Section - Added by XY -->
                    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                        <h4 style="color: #374151; margin: 0 0 15px 0; font-size: 16px;">Share Your Achievement!</h4>
                        <p style="color: #6b7280; margin: 0 0 20px 0; font-size: 14px;">Help inspire others by sharing your sustainability pledge on social media.</p>
                        <div style="display: flex; gap: 12px; justify-content: center; align-items: center;">
                            <a href="https://twitter.com/intent/tweet?text=I%20just%20earned%20a%20sustainability%20badge%20at%20Republic%20Polytechnic!%20Join%20me%20in%20making%20a%20difference.%20%23RPGreen%20%23Sustainability%20%23ESG" 
                               style="display: inline-flex; align-items: center; gap: 6px; background: #1da1f2; color: white; padding: 10px 16px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 600; transition: background-color 0.2s;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                                </svg>
                                Twitter
                            </a>
                            <a href="https://wa.me/?text=I%20just%20earned%20a%20sustainability%20badge%20at%20Republic%20Polytechnic!%20Join%20me%20in%20making%20a%20difference.%20%23RPGreen%20%23Sustainability%20%23ESG" 
                               style="display: inline-flex; align-items: center; gap: 6px; background: #25d366; color: white; padding: 10px 16px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 600; transition: background-color 0.2s;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
                                </svg>
                                WhatsApp
                            </a>
                            <a href="https://www.instagram.com/" 
                               style="display: inline-flex; align-items: center; gap: 6px; background: linear-gradient(45deg, #f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%); color: white; padding: 10px 16px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 600; transition: background-color 0.2s;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                                </svg>
                                Instagram
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        `
    },
    'eco-warrior': {
        name: 'Eco Warrior',
        description: 'For making an environmental pledge',
        subject: 'Congratulations on Earning Your Eco Warrior Badge!',
        icon: '🌱',
        imageUrl: 'https://img.icons8.com/fluency/96/leaf.png',
        color: '#059669',
        textTemplate: `Hello!\n\nCongratulations! By making an environmental pledge, you've earned the "Eco Warrior" badge.\n\nYour commitment to sustainability makes a real difference!\n\nBest regards,\nRP Xperience Centre Team`,
        htmlTemplate: `
            <div style="font-family: Arial, sans-serif; max-width:600px; margin:0 auto; background: linear-gradient(135deg, #ecfdf5, #d1fae5); padding: 20px; border-radius: 10px;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <div style="width: 80px; height: 80px; margin: 0 auto 15px; background: linear-gradient(135deg, #059669, #047857); border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 15px rgba(5, 150, 105, 0.3);">
                        <img src="https://img.icons8.com/fluency/72/ffffff/leaf.png" alt="Eco Warrior badge" style="width: 48px; height: 48px;" />
                    </div>
                    <div style="background: linear-gradient(135deg, #059669, #047857); color: white; padding: 15px 30px; border-radius: 50px; display: inline-block; box-shadow: 0 4px 15px rgba(5, 150, 105, 0.3);">
                        <h2 style="margin: 0; font-size: 24px;">Eco Warrior</h2>
                        <p style="margin: 5px 0 0 0; opacity: 0.9;">Badge Earned!</p>
                    </div>
                </div>
                <div style="background: white; padding: 25px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                    <h3 style="color:#059669; margin-top: 0;">Congratulations, Eco Warrior!</h3>
                    <p>Hello!</p>
                    <p>Congratulations! By making an environmental pledge, you've earned the <strong>"Eco Warrior"</strong> badge. You're now part of our sustainability champions!</p>
                    <p>Your commitment to protecting our planet makes a real difference. Together, we can create a greener future!</p>
                    <div style="text-align: center; margin: 25px 0;">
                        <div style="display: inline-block; background: linear-gradient(135deg, #059669, #047857); color: white; padding: 10px 20px; border-radius: 20px; font-weight: bold;">
                            🌍 Planet Protector 🛡️
                        </div>
                    </div>
                    <p>Best regards,<br><strong>RP Xperience Centre Team</strong></p>
                    
                    <!-- Social Media Sharing Section - Added by XY -->
                    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                        <h4 style="color: #374151; margin: 0 0 15px 0; font-size: 16px;">Share Your Achievement!</h4>
                        <p style="color: #6b7280; margin: 0 0 20px 0; font-size: 14px;">Help inspire others by sharing your sustainability pledge on social media.</p>
                        <div style="display: flex; gap: 12px; justify-content: center; align-items: center;">
                            <a href="https://twitter.com/intent/tweet?text=I%20just%20earned%20the%20Eco%20Warrior%20badge%20at%20Republic%20Polytechnic!%20Join%20me%20in%20protecting%20our%20planet.%20%23RPGreen%20%23Sustainability%20%23ESG" 
                               style="display: inline-flex; align-items: center; gap: 6px; background: #1da1f2; color: white; padding: 10px 16px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 600; transition: background-color 0.2s;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                                </svg>
                                Twitter
                            </a>
                            <a href="https://wa.me/?text=I%20just%20earned%20the%20Eco%20Warrior%20badge%20at%20Republic%20Polytechnic!%20Join%20me%20in%20protecting%20our%20planet.%20%23RPGreen%20%23Sustainability%20%23ESG" 
                               style="display: inline-flex; align-items: center; gap: 6px; background: #25d366; color: white; padding: 10px 16px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 600; transition: background-color 0.2s;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
                                </svg>
                                WhatsApp
                            </a>
                            <a href="https://www.instagram.com/" 
                               style="display: inline-flex; align-items: center; gap: 6px; background: linear-gradient(45deg, #f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%); color: white; padding: 10px 16px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 600; transition: background-color 0.2s;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                                </svg>
                                Instagram
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        `
    },
    'pledge-maker': {
        name: 'Commitment Champion',
        description: 'For making any pledge commitment',
        subject: 'Congratulations on Earning Your Commitment Champion Badge!',
        icon: '🤝',
        imageUrl: 'https://img.icons8.com/fluency/96/handshake.png',
        color: '#3b82f6',
        textTemplate: `Hello!\n\nCongratulations on making a pledge commitment! You've earned the "Commitment Champion" badge.\n\nYour pledges help drive positive change!\n\nBest regards,\nRP Xperience Centre Team`,
        htmlTemplate: `
            <div style="font-family: Arial, sans-serif; max-width:600px; margin:0 auto; background: linear-gradient(135deg, #eff6ff, #dbeafe); padding: 20px; border-radius: 10px;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <div style="width: 80px; height: 80px; margin: 0 auto 15px; background: linear-gradient(135deg, #3b82f6, #2563eb); border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 15px rgba(59, 130, 246, 0.3);">
                        <img src="https://img.icons8.com/fluency/72/ffffff/handshake.png" alt="Commitment Champion badge" style="width: 48px; height: 48px;" />
                    </div>
                    <div style="background: linear-gradient(135deg, #3b82f6, #2563eb); color: white; padding: 15px 30px; border-radius: 50px; display: inline-block; box-shadow: 0 4px 15px rgba(59, 130, 246, 0.3);">
                        <h2 style="margin: 0; font-size: 24px;">Commitment Champion</h2>
                        <p style="margin: 5px 0 0 0; opacity: 0.9;">Badge Earned!</p>
                    </div>
                </div>
                <div style="background: white; padding: 25px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                    <h3 style="color:#3b82f6; margin-top: 0;">Congratulations, Commitment Champion!</h3>
                    <p>Hello!</p>
                    <p>Congratulations on making a pledge commitment! You've earned the <strong>"Commitment Champion"</strong> badge for taking concrete steps toward positive change.</p>
                    <p>Your pledges help drive meaningful progress. Every commitment counts toward building a better future!</p>
                    <div style="text-align: center; margin: 25px 0;">
                        <div style="display: inline-block; background: linear-gradient(135deg, #3b82f6, #2563eb); color: white; padding: 10px 20px; border-radius: 20px; font-weight: bold;">
                            💪 Commitment Champion
                        </div>
                    </div>
                    <p>Best regards,<br><strong>RP Xperience Centre Team</strong></p>
                    
                    <!-- Social Media Sharing Section - Added by XY -->
                    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                        <h4 style="color: #374151; margin: 0 0 15px 0; font-size: 16px;">Share Your Achievement!</h4>
                        <p style="color: #6b7280; margin: 0 0 15px 0; font-size: 14px;">Help inspire others by sharing your sustainability pledge on social media.</p>
                        <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                            <a href="https://twitter.com/intent/tweet?text=I%20just%20earned%20the%20Commitment%20Champion%20badge%20at%20Republic%20Polytechnic!%20Join%20me%20in%20taking%20action%20for%20a%20better%20future.%20%23RPGreen%20%23Sustainability%20%23ESG" 
                               style="display: inline-block; background: #1da1f2; color: white; padding: 8px 12px; border-radius: 6px; text-decoration: none; font-size: 12px; font-weight: bold;">
                                🐦 Twitter
                            </a>
                            <a href="https://wa.me/?text=I%20just%20earned%20the%20Commitment%20Champion%20badge%20at%20Republic%20Polytechnic!%20Join%20me%20in%20taking%20action%20for%20a%20better%20future.%20%23RPGreen%20%23Sustainability%20%23ESG" 
                               style="display: inline-block; background: #25d366; color: white; padding: 8px 12px; border-radius: 6px; text-decoration: none; font-size: 12px; font-weight: bold;">
                                📱 WhatsApp
                            </a>
                            <a href="https://www.instagram.com/" 
                               style="display: inline-block; background: #e1306c; color: white; padding: 8px 12px; border-radius: 6px; text-decoration: none; font-size: 12px; font-weight: bold;">
                                📸 Instagram
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        `
    },
    'climate-champion': {
        name: 'Climate Champion',
        description: 'For pledges focused on climate action and lowering emissions',
        subject: 'Congratulations on Earning Your Climate Champion Badge!',
        icon: '🌎',
        imageUrl: 'https://img.icons8.com/fluency/96/earth-globe.png',
        color: '#0ea5e9',
        textTemplate: `Hello!\n\nCongratulations on pledging climate action! You've earned the "Climate Champion" badge.\n\nYour commitment to the climate helps protect our planet.\n\nBest regards,\nRP Xperience Centre Team`,
        htmlTemplate: `
            <div style="font-family: Arial, sans-serif; max-width:600px; margin:0 auto; background: linear-gradient(135deg, #ecfeff, #dbeafe); padding: 20px; border-radius: 10px;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <div style="width: 80px; height: 80px; margin: 0 auto 15px; background: linear-gradient(135deg, #0ea5e9, #0284c7); border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 15px rgba(14, 165, 233, 0.3);">
                        <span style="font-size: 36px;">🌎</span>
                    </div>
                    <div style="background: linear-gradient(135deg, #0ea5e9, #0284c7); color: white; padding: 15px 30px; border-radius: 50px; display: inline-block; box-shadow: 0 4px 15px rgba(14, 165, 233, 0.3);">
                        <h2 style="margin: 0; font-size: 24px;">Climate Champion</h2>
                        <p style="margin: 5px 0 0 0; opacity: 0.9;">Badge Earned!</p>
                    </div>
                </div>
                <div style="background: white; padding: 25px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                    <h3 style="color:#0ea5e9; margin-top: 0;">Congratulations, Climate Champion!</h3>
                    <p>Hello!</p>
                    <p>Congratulations! By choosing climate action, you've earned the <strong>"Climate Champion"</strong> badge. Your pledge supports a healthier, more resilient planet.</p>
                    <p>Thank you for stepping up to reduce emissions and protect our climate.</p>
                    <div style="text-align: center; margin: 25px 0;">
                        <div style="display: inline-block; background: linear-gradient(135deg, #0ea5e9, #0284c7); color: white; padding: 10px 20px; border-radius: 20px; font-weight: bold;">
                            🌍 Climate Action Hero
                        </div>
                    </div>
                    <p>Best regards,<br><strong>RP Xperience Centre Team</strong></p>
                    
                    <!-- Social Media Sharing Section - Added by XY -->
                    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                        <h4 style="color: #374151; margin: 0 0 15px 0; font-size: 16px;">Share Your Achievement!</h4>
                        <p style="color: #6b7280; margin: 0 0 20px 0; font-size: 14px;">Help inspire others by sharing your sustainability pledge on social media.</p>
                        <div style="display: flex; gap: 12px; justify-content: center; align-items: center;">
                            <a href="https://twitter.com/intent/tweet?text=I%20just%20earned%20the%20Climate%20Champion%20badge%20at%20Republic%20Polytechnic!%20Join%20me%20in%20fighting%20climate%20change.%20%23RPGreen%20%23Sustainability%20%23ESG" 
                               style="display: inline-flex; align-items: center; gap: 6px; background: #1da1f2; color: white; padding: 10px 16px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 600; transition: background-color 0.2s;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                                </svg>
                                Twitter
                            </a>
                            <a href="https://wa.me/?text=I%20just%20earned%20the%20Climate%20Champion%20badge%20at%20Republic%20Polytechnic!%20Join%20me%20in%20fighting%20climate%20change.%20%23RPGreen%20%23Sustainability%20%23ESG" 
                               style="display: inline-flex; align-items: center; gap: 6px; background: #25d366; color: white; padding: 10px 16px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 600; transition: background-color 0.2s;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
                                </svg>
                                WhatsApp
                            </a>
                            <a href="https://www.instagram.com/" 
                               style="display: inline-flex; align-items: center; gap: 6px; background: linear-gradient(45deg, #f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%); color: white; padding: 10px 16px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 600; transition: background-color 0.2s;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                                </svg>
                                Instagram
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        `
    },
    'renewable-innovator': {
        name: 'Renewable Innovator',
        description: 'For pledges focused on renewable energy and clean power',
        subject: 'Congratulations on Earning Your Renewable Innovator Badge!',
        icon: '⚡',
        imageUrl: 'https://img.icons8.com/fluency/96/solar-panel.png',
        color: '#22c55e',
        textTemplate: `Hello!\n\nCongratulations on pledging renewable energy! You've earned the "Renewable Innovator" badge.\n\nYour commitment to clean power is energizing the future.\n\nBest regards,\nRP Xperience Centre Team`,
        htmlTemplate: `
            <div style="font-family: Arial, sans-serif; max-width:600px; margin:0 auto; background: linear-gradient(135deg, #ecfdf5, #e7f5ff); padding: 20px; border-radius: 10px;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <div style="width: 80px; height: 80px; margin: 0 auto 15px; background: linear-gradient(135deg, #22c55e, #16a34a); border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 15px rgba(34, 197, 94, 0.3);">
                        <span style="font-size: 36px;">⚡</span>
                    </div>
                    <div style="background: linear-gradient(135deg, #22c55e, #16a34a); color: white; padding: 15px 30px; border-radius: 50px; display: inline-block; box-shadow: 0 4px 15px rgba(34, 197, 94, 0.3);">
                        <h2 style="margin: 0; font-size: 24px;">Renewable Innovator</h2>
                        <p style="margin: 5px 0 0 0; opacity: 0.9;">Badge Earned!</p>
                    </div>
                </div>
                <div style="background: white; padding: 25px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                    <h3 style="color:#16a34a; margin-top: 0;">Congratulations, Renewable Innovator!</h3>
                    <p>Hello!</p>
                    <p>Congratulations! By choosing renewable energy, you've earned the <strong>"Renewable Innovator"</strong> badge. Your pledge supports a cleaner energy future.</p>
                    <p>Thank you for helping power sustainability through smart energy choices.</p>
                    <div style="text-align: center; margin: 25px 0;">
                        <div style="display: inline-block; background: linear-gradient(135deg, #22c55e, #16a34a); color: white; padding: 10px 20px; border-radius: 20px; font-weight: bold;">
                            ⚡ Clean Power Leader
                        </div>
                    </div>
                    <p>Best regards,<br><strong>RP Xperience Centre Team</strong></p>
                    
                    <!-- Social Media Sharing Section - Added by XY -->
                    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                        <h4 style="color: #374151; margin: 0 0 15px 0; font-size: 16px;">Share Your Achievement!</h4>
                        <p style="color: #6b7280; margin: 0 0 20px 0; font-size: 14px;">Help inspire others by sharing your sustainability pledge on social media.</p>
                        <div style="display: flex; gap: 12px; justify-content: center; align-items: center;">
                            <a href="https://twitter.com/intent/tweet?text=I%20just%20earned%20the%20Renewable%20Innovator%20badge%20at%20Republic%20Polytechnic!%20Join%20me%20in%20powering%20a%20clean%20energy%20future.%20%23RPGreen%20%23Sustainability%20%23ESG" 
                               style="display: inline-flex; align-items: center; gap: 6px; background: #1da1f2; color: white; padding: 10px 16px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 600; transition: background-color 0.2s;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                                </svg>
                                Twitter
                            </a>
                            <a href="https://wa.me/?text=I%20just%20earned%20the%20Renewable%20Innovator%20badge%20at%20Republic%20Polytechnic!%20Join%20me%20in%20powering%20a%20clean%20energy%20future.%20%23RPGreen%20%23Sustainability%20%23ESG" 
                               style="display: inline-flex; align-items: center; gap: 6px; background: #25d366; color: white; padding: 10px 16px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 600; transition: background-color 0.2s;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
                                </svg>
                                WhatsApp
                            </a>
                            <a href="https://www.instagram.com/" 
                               style="display: inline-flex; align-items: center; gap: 6px; background: linear-gradient(45deg, #f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%); color: white; padding: 10px 16px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 600; transition: background-color 0.2s;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                                </svg>
                                Instagram
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        `
    },
    'sustainable-living-advocate': {
        name: 'Sustainable Living Advocate',
        description: 'For pledges focused on sustainable lifestyle habits',
        subject: 'Congratulations on Earning Your Sustainable Living Advocate Badge!',
        icon: '🌿',
        imageUrl: 'https://img.icons8.com/fluency/96/leaf.png',
        color: '#16a34a',
        textTemplate: `Hello!\n\nCongratulations on pledging sustainable living! You've earned the "Sustainable Living Advocate" badge.\n\nYour commitment to greener habits inspires others.\n\nBest regards,\nRP Xperience Centre Team`,
        htmlTemplate: `
            <div style="font-family: Arial, sans-serif; max-width:600px; margin:0 auto; background: linear-gradient(135deg, #ecfdf5, #eff6ff); padding: 20px; border-radius: 10px;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <div style="width: 80px; height: 80px; margin: 0 auto 15px; background: linear-gradient(135deg, #16a34a, #15803d); border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 15px rgba(22, 163, 74, 0.3);">
                        <span style="font-size: 36px;">🌿</span>
                    </div>
                    <div style="background: linear-gradient(135deg, #16a34a, #15803d); color: white; padding: 15px 30px; border-radius: 50px; display: inline-block; box-shadow: 0 4px 15px rgba(22, 163, 74, 0.3);">
                        <h2 style="margin: 0; font-size: 24px;">Sustainable Living Advocate</h2>
                        <p style="margin: 5px 0 0 0; opacity: 0.9;">Badge Earned!</p>
                    </div>
                </div>
                <div style="background: white; padding: 25px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                    <h3 style="color:#15803d; margin-top: 0;">Congratulations, Sustainable Living Advocate!</h3>
                    <p>Hello!</p>
                    <p>Congratulations! By choosing sustainable living, you've earned the <strong>"Sustainable Living Advocate"</strong> badge. Your pledge helps create everyday eco-friendly habits.</p>
                    <p>Thank you for supporting greener, more sustainable choices in daily life.</p>
                    <div style="text-align: center; margin: 25px 0;">
                        <div style="display: inline-block; background: linear-gradient(135deg, #16a34a, #15803d); color: white; padding: 10px 20px; border-radius: 20px; font-weight: bold;">
                            🌱 Green Lifestyle Leader
                        </div>
                    </div>
                    <p>Best regards,<br><strong>RP Xperience Centre Team</strong></p>
                    
                    <!-- Social Media Sharing Section - Added by XY -->
                    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                        <h4 style="color: #374151; margin: 0 0 15px 0; font-size: 16px;">Share Your Achievement!</h4>
                        <p style="color: #6b7280; margin: 0 0 20px 0; font-size: 14px;">Help inspire others by sharing your sustainability pledge on social media.</p>
                        <div style="display: flex; gap: 12px; justify-content: center; align-items: center;">
                            <a href="https://twitter.com/intent/tweet?text=I%20just%20earned%20the%20Sustainable%20Living%20Advocate%20badge%20at%20Republic%20Polytechnic!%20Join%20me%20in%20living%20sustainably.%20%23RPGreen%20%23Sustainability%20%23ESG" 
                               style="display: inline-flex; align-items: center; gap: 6px; background: #1da1f2; color: white; padding: 10px 16px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 600; transition: background-color 0.2s;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                                </svg>
                                Twitter
                            </a>
                            <a href="https://wa.me/?text=I%20just%20earned%20the%20Sustainable%20Living%20Advocate%20badge%20at%20Republic%20Polytechnic!%20Join%20me%20in%20living%20sustainably.%20%23RPGreen%20%23Sustainability%20%23ESG" 
                               style="display: inline-flex; align-items: center; gap: 6px; background: #25d366; color: white; padding: 10px 16px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 600; transition: background-color 0.2s;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
                                </svg>
                                WhatsApp
                            </a>
                            <a href="https://www.instagram.com/" 
                               style="display: inline-flex; align-items: center; gap: 6px; background: linear-gradient(45deg, #f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%); color: white; padding: 10px 16px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 600; transition: background-color 0.2s;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                                </svg>
                                Instagram
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        `
    },
    'ocean-guardian': {
        name: 'Ocean Guardian',
        description: 'For pledges focused on ocean conservation and marine protection',
        subject: 'Congratulations on Earning Your Ocean Guardian Badge!',
        icon: '🌊',
        imageUrl: 'https://img.icons8.com/fluency/96/wave.png',
        color: '#0ea5e9',
        textTemplate: `Hello!\n\nCongratulations on pledging ocean conservation! You've earned the "Ocean Guardian" badge.\n\nYour commitment to protecting marine life is truly inspiring.\n\nBest regards,\nRP Xperience Centre Team`,
        htmlTemplate: `
            <div style="font-family: Arial, sans-serif; max-width:600px; margin:0 auto; background: linear-gradient(135deg, #eff6ff, #e0f2fe); padding: 20px; border-radius: 10px;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <div style="width: 80px; height: 80px; margin: 0 auto 15px; background: linear-gradient(135deg, #0ea5e9, #0369a1); border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 15px rgba(14, 165, 233, 0.3);">
                        <span style="font-size: 36px;">🌊</span>
                    </div>
                    <div style="background: linear-gradient(135deg, #0ea5e9, #0369a1); color: white; padding: 15px 30px; border-radius: 50px; display: inline-block; box-shadow: 0 4px 15px rgba(14, 165, 233, 0.3);">
                        <h2 style="margin: 0; font-size: 24px;">Ocean Guardian</h2>
                        <p style="margin: 5px 0 0 0; opacity: 0.9;">Badge Earned!</p>
                    </div>
                </div>
                <div style="background: white; padding: 25px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                    <h3 style="color:#0369a1; margin-top: 0;">Congratulations, Ocean Guardian!</h3>
                    <p>Hello!</p>
                    <p>Congratulations! By choosing ocean conservation, you've earned the <strong>"Ocean Guardian"</strong> badge. Your pledge supports the protection of marine ecosystems and clean seas.</p>
                    <p>Thank you for standing up for our oceans and marine life.</p>
                    <div style="text-align: center; margin: 25px 0;">
                        <div style="display: inline-block; background: linear-gradient(135deg, #0ea5e9, #0369a1); color: white; padding: 10px 20px; border-radius: 20px; font-weight: bold;">
                            🌊 Marine Protector
                        </div>
                    </div>
                    <p>Best regards,<br><strong>RP Xperience Centre Team</strong></p>
                    
                    <!-- Social Media Sharing Section - Added by XY -->
                    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                        <h4 style="color: #374151; margin: 0 0 15px 0; font-size: 16px;">Share Your Achievement!</h4>
                        <p style="color: #6b7280; margin: 0 0 20px 0; font-size: 14px;">Help inspire others by sharing your sustainability pledge on social media.</p>
                        <div style="display: flex; gap: 12px; justify-content: center; align-items: center;">
                            <a href="https://twitter.com/intent/tweet?text=I%20just%20earned%20the%20Ocean%20Guardian%20badge%20at%20Republic%20Polytechnic!%20Join%20me%20in%20protecting%20our%20oceans.%20%23RPGreen%20%23Sustainability%20%23ESG" 
                               style="display: inline-flex; align-items: center; gap: 6px; background: #1da1f2; color: white; padding: 10px 16px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 600; transition: background-color 0.2s;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                                </svg>
                                Twitter
                            </a>
                            <a href="https://wa.me/?text=I%20just%20earned%20the%20Ocean%20Guardian%20badge%20at%20Republic%20Polytechnic!%20Join%20me%20in%20protecting%20our%20oceans.%20%23RPGreen%20%23Sustainability%20%23ESG" 
                               style="display: inline-flex; align-items: center; gap: 6px; background: #25d366; color: white; padding: 10px 16px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 600; transition: background-color 0.2s;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
                                </svg>
                                WhatsApp
                            </a>
                            <a href="https://www.instagram.com/" 
                               style="display: inline-flex; align-items: center; gap: 6px; background: linear-gradient(45deg, #f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%); color: white; padding: 10px 16px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 600; transition: background-color 0.2s;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                                </svg>
                                Instagram
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        `
    },
    'social-champion': {
        name: 'Social Champion',
        description: 'For making social responsibility pledges',
        subject: 'Congratulations on Earning Your Social Champion Badge!',
        icon: '🤝',
        imageUrl: 'https://img.icons8.com/fluency/96/group.png',
        color: '#f59e0b',
        textTemplate: `Hello!\n\nCongratulations! By making a social responsibility pledge, you've earned the "Social Champion" badge.\n\nYour commitment to community and inclusion makes a real difference!\n\nBest regards,\nRP Xperience Centre Team`,
        htmlTemplate: `
            <div style="font-family: Arial, sans-serif; max-width:600px; margin:0 auto; background: linear-gradient(135deg, #fef3c7, #fde68a); padding: 20px; border-radius: 10px;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <div style="width: 80px; height: 80px; margin: 0 auto 15px; background: linear-gradient(135deg, #f59e0b, #d97706); border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 15px rgba(245, 158, 11, 0.3);">
                        <img src="https://img.icons8.com/fluency/72/ffffff/group.png" alt="Social Champion badge" style="width: 48px; height: 48px;" />
                    </div>
                    <div style="background: linear-gradient(135deg, #f59e0b, #d97706); color: white; padding: 15px 30px; border-radius: 50px; display: inline-block; box-shadow: 0 4px 15px rgba(245, 158, 11, 0.3);">
                        <h2 style="margin: 0; font-size: 24px;">Social Champion</h2>
                        <p style="margin: 5px 0 0 0; opacity: 0.9;">Badge Earned!</p>
                    </div>
                </div>
                <div style="background: white; padding: 25px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                    <h3 style="color:#f59e0b; margin-top: 0;">Congratulations, Social Champion!</h3>
                    <p>Hello!</p>
                    <p>Congratulations! By making a social responsibility pledge, you've earned the <strong>"Social Champion"</strong> badge. You're now part of our community champions!</p>
                    <p>Your commitment to diversity, inclusion, and community support makes a real difference. Together, we can build stronger, more inclusive communities!</p>
                    <div style="text-align: center; margin: 25px 0;">
                        <div style="display: inline-block; background: linear-gradient(135deg, #f59e0b, #d97706); color: white; padding: 10px 20px; border-radius: 20px; font-weight: bold;">
                            🤝 Community Builder 🏘️
                        </div>
                    </div>
                    <p>Best regards,<br><strong>RP Xperience Centre Team</strong></p>
                    
                    <!-- Social Media Sharing Section - Added by XY -->
                    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                        <h4 style="color: #374151; margin: 0 0 15px 0; font-size: 16px;">Share Your Achievement!</h4>
                        <p style="color: #6b7280; margin: 0 0 20px 0; font-size: 14px;">Help inspire others by sharing your sustainability pledge on social media.</p>
                        <div style="display: flex; gap: 12px; justify-content: center; align-items: center;">
                            <a href="https://twitter.com/intent/tweet?text=I%20just%20earned%20the%20Social%20Champion%20badge%20at%20Republic%20Polytechnic!%20Join%20me%20in%20building%20stronger%20communities.%20%23RPGreen%20%23Sustainability%20%23ESG" 
                               style="display: inline-flex; align-items: center; gap: 6px; background: #1da1f2; color: white; padding: 10px 16px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 600; transition: background-color 0.2s;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                                </svg>
                                Twitter
                            </a>
                            <a href="https://wa.me/?text=I%20just%20earned%20the%20Social%20Champion%20badge%20at%20Republic%20Polytechnic!%20Join%20me%20in%20building%20stronger%20communities.%20%23RPGreen%20%23Sustainability%20%23ESG" 
                               style="display: inline-flex; align-items: center; gap: 6px; background: #25d366; color: white; padding: 10px 16px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 600; transition: background-color 0.2s;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
                                </svg>
                                WhatsApp
                            </a>
                            <a href="https://www.instagram.com/" 
                               style="display: inline-flex; align-items: center; gap: 6px; background: linear-gradient(45deg, #f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%); color: white; padding: 10px 16px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 600; transition: background-color 0.2s;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                                </svg>
                                Instagram
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        `
    },
    'governance-guardian': {
        name: 'Governance Guardian',
        description: 'For making governance and ethics pledges',
        subject: 'Congratulations on Earning Your Governance Guardian Badge!',
        icon: '⚖️',
        imageUrl: 'https://img.icons8.com/fluency/96/justice-scale.png',
        color: '#8b5cf6',
        textTemplate: `Hello!\n\nCongratulations! By making a governance and ethics pledge, you've earned the "Governance Guardian" badge.\n\nYour commitment to transparency and accountability strengthens our society!\n\nBest regards,\nRP Xperience Centre Team`,
        htmlTemplate: `
            <div style="font-family: Arial, sans-serif; max-width:600px; margin:0 auto; background: linear-gradient(135deg, #f3e8ff, #e9d5ff); padding: 20px; border-radius: 10px;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <div style="width: 80px; height: 80px; margin: 0 auto 15px; background: linear-gradient(135deg, #8b5cf6, #7c3aed); border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 15px rgba(139, 92, 246, 0.3);">
                        <img src="https://img.icons8.com/fluency/72/ffffff/justice-scale.png" alt="Governance Guardian badge" style="width: 48px; height: 48px;" />
                    </div>
                    <div style="background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white; padding: 15px 30px; border-radius: 50px; display: inline-block; box-shadow: 0 4px 15px rgba(139, 92, 246, 0.3);">
                        <h2 style="margin: 0; font-size: 24px;">Governance Guardian</h2>
                        <p style="margin: 5px 0 0 0; opacity: 0.9;">Badge Earned!</p>
                    </div>
                </div>
                <div style="background: white; padding: 25px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                    <h3 style="color:#8b5cf6; margin-top: 0;">Congratulations, Governance Guardian!</h3>
                    <p>Hello!</p>
                    <p>Congratulations! By making a governance and ethics pledge, you've earned the <strong>"Governance Guardian"</strong> badge. You're now part of our ethics champions!</p>
                    <p>Your commitment to transparency, accountability, and ethical practices strengthens trust and integrity in our society. Every pledge counts toward better governance!</p>
                    <div style="text-align: center; margin: 25px 0;">
                        <div style="display: inline-block; background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white; padding: 10px 20px; border-radius: 20px; font-weight: bold;">
                            ⚖️ Ethics Champion 🛡️
                        </div>
                    </div>
                    <p>Best regards,<br><strong>RP Xperience Centre Team</strong></p>
                    
                    <!-- Social Media Sharing Section - Added by XY -->
                    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                        <h4 style="color: #374151; margin: 0 0 15px 0; font-size: 16px;">Share Your Achievement!</h4>
                        <p style="color: #6b7280; margin: 0 0 20px 0; font-size: 14px;">Help inspire others by sharing your sustainability pledge on social media.</p>
                        <div style="display: flex; gap: 12px; justify-content: center; align-items: center;">
                            <a href="https://twitter.com/intent/tweet?text=I%20just%20earned%20the%20Governance%20Guardian%20badge%20at%20Republic%20Polytechnic!%20Join%20me%20in%20promoting%20transparency%20and%20ethics.%20%23RPGreen%20%23Sustainability%20%23ESG" 
                               style="display: inline-flex; align-items: center; gap: 6px; background: #1da1f2; color: white; padding: 10px 16px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 600; transition: background-color 0.2s;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                                </svg>
                                Twitter
                            </a>
                            <a href="https://wa.me/?text=I%20just%20earned%20the%20Governance%20Guardian%20badge%20at%20Republic%20Polytechnic!%20Join%20me%20in%20promoting%20transparency%20and%20ethics.%20%23RPGreen%20%23Sustainability%20%23ESG" 
                               style="display: inline-flex; align-items: center; gap: 6px; background: #25d366; color: white; padding: 10px 16px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 600; transition: background-color 0.2s;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
                                </svg>
                                WhatsApp
                            </a>
                            <a href="https://www.instagram.com/" 
                               style="display: inline-flex; align-items: center; gap: 6px; background: linear-gradient(45deg, #f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%); color: white; padding: 10px 16px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 600; transition: background-color 0.2s;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                                </svg>
                                Instagram
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        `
    }
};

// ==================== BADGE DETERMINATION LOGIC ====================
// Done by XY - Intelligent badge selection algorithm
// Analyzes pledge content using keyword matching and returns one or more badges:
// - Eco Warrior for environmental content
// - Social Champion for social content
// - Governance Guardian for governance/ethics content
// - Commitment Champion for a generic pledge when no topic keyword matches
// - Feedback Contributor when no pledge is provided
// Topic-based badge mapping added by XY
// Selected pledge topic maps directly to a single dedicated badge.
// If topic selection is missing, the system still falls back to keyword-based detection.
const TOPIC_BADGE_MAP = {
    'climate-change': 'climate-champion',
    'renewable-energy': 'renewable-innovator',
    'sustainable-living': 'sustainable-living-advocate',
    'ocean-conservation': 'ocean-guardian',
    'ethical-governance': 'governance-guardian',
    'community-impact': 'social-champion'
};

const ACTIVE_BADGE_KEYS = [
    'feedback-completer',
    'climate-champion',
    'renewable-innovator',
    'sustainable-living-advocate',
    'ocean-guardian',
    'governance-guardian',
    'social-champion'
];

const ACTIVE_BADGE_CONFIGS = Object.fromEntries(
    ACTIVE_BADGE_KEYS.map(key => [key, BADGE_CONFIGS[key]]).filter(([, badge]) => Boolean(badge))
);

function normalizePledgeTopics(userData = {}) {
    const rawTopics = Array.isArray(userData.pledgeTopics)
        ? userData.pledgeTopics
        : (typeof userData.pledgeTopic === 'string' ? userData.pledgeTopic.split(',') : []);

    return [...new Set(rawTopics
        .map(topic => String(topic || '').trim())
        .filter(topic => TOPIC_BADGE_MAP[topic]))];
}

function determineBadgeKeys(userData) {
    const selectedTopics = normalizePledgeTopics(userData);
    const topicBadgeKeys = selectedTopics
        .map(topic => TOPIC_BADGE_MAP[topic])
        .filter(Boolean);

    return topicBadgeKeys.length > 0
        ? [...new Set(topicBadgeKeys)]
        : ['feedback-completer'];
}

function determineBadge(userData) {
    const badgeKeys = determineBadgeKeys(userData);
    return badgeKeys[0] || 'feedback-completer';
}

function getBadgeSummary(userData) {
    const badgeKey = determineBadge(userData);
    const badgeConfig = BADGE_CONFIGS[badgeKey] || BADGE_CONFIGS['feedback-completer'];

    return {
        badgeKey,
        badgeName: badgeConfig.name,
        badgeDescription: badgeConfig.description,
        badgeColor: badgeConfig.color
    };
}

function getBadgeSummaries(userData) {
    return determineBadgeKeys(userData).map((badgeKey) => {
        const badgeConfig = BADGE_CONFIGS[badgeKey] || BADGE_CONFIGS['feedback-completer'];
        return {
            badgeKey,
            badgeName: badgeConfig.name,
            badgeDescription: badgeConfig.description,
            badgeColor: badgeConfig.color
        };
    });
}

function buildBadgeEmailHtml(badgeConfigs) {
    const badgeCards = badgeConfigs.map(badge => `
        <div style="width: 100%; max-width: 260px; margin: 10px; padding: 18px; border-radius: 16px; background: #ffffff; box-shadow: 0 8px 24px rgba(0,0,0,0.08); border: 1px solid #e5e7eb;">
            <div style="width: 64px; height: 64px; margin: 0 auto 14px auto; background: ${badge.color}; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 32px; color: #ffffff;">
                ${badge.icon}
            </div>
            <h3 style="font-size: 18px; margin: 0 0 10px 0; color: #111827; text-align: center;">${badge.name}</h3>
            <p style="font-size: 13px; color: #4b5563; line-height: 1.5; text-align: center; margin: 0;">${badge.description}</p>
        </div>
    `).join('');

    return `
        <div style="font-family: Arial, sans-serif; max-width:600px; margin:0 auto; background: linear-gradient(135deg, #f8fafc, #eff6ff); padding: 20px; border-radius: 12px;">
            <div style="text-align:center; margin-bottom: 24px;">
                <h2 style="margin:0; color:#0f172a; font-size:28px;">Congratulations!</h2>
                <p style="margin:12px auto 0 auto; max-width:480px; color:#334155; font-size:15px; line-height:1.6;">
                    You've earned the following badge${badgeConfigs.length > 1 ? 's' : ''} based on your pledge topics.
                </p>
            </div>
            <div style="display:flex; flex-wrap:wrap; justify-content:center; gap:12px;">
                ${badgeCards}
            </div>
            <div style="margin-top:24px; background:#ffffff; padding:18px; border-radius:14px; box-shadow:0 6px 18px rgba(15,23,42,0.08);">
                <p style="font-size:13px; color:#475569; line-height:1.7; margin:0;">
                    Thank you for sharing your pledge — your commitment helps create a better future.
                </p>
            </div>
        </div>
    `;
}

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatTopic(topic) {
    return String(topic || '')
        .split('-')
        .filter(Boolean)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

function formatTopicList(topics) {
    const normalizedTopics = Array.isArray(topics)
        ? topics
        : (typeof topics === 'string' ? topics.split(',') : []);
    const labels = normalizedTopics
        .map(topic => formatTopic(topic))
        .filter(Boolean);

    return labels.length > 0 ? labels.join(', ') : '';
}

function formatVisitDate(value) {
    const date = value ? new Date(value) : new Date();

    if (Number.isNaN(date.getTime())) {
        return new Date().toLocaleString('en-SG', {
            timeZone: 'Asia/Singapore',
            dateStyle: 'medium',
            timeStyle: 'short'
        });
    }

    return date.toLocaleString('en-SG', {
        timeZone: 'Asia/Singapore',
        dateStyle: 'medium',
        timeStyle: 'short'
    });
}

function formatRetentionSummary(retention, retentionDays) {
    const normalized = String(retention || '').toLowerCase();
    const days = Number(retentionDays);

    if (normalized === 'temporary' || normalized === '7days' || normalized === '7day') {
        const safeDays = Number.isFinite(days) && days > 0 ? Math.round(days) : 7;
        return `${safeDays} ${safeDays === 1 ? 'day' : 'days'} temporary retention`;
    }

    if (normalized === 'longterm' || normalized === 'indefinite') {
        return 'Long-term display consent';
    }

    return 'Visitor-selected retention';
}

function stripPhotoAttachmentSentence(text) {
    const cleaned = String(text || '')
        .replace(/\s*Attached below is your commemorative photo from your visit\./i, '')
        .trim();

    return cleaned || 'Thank you for taking the time to visit our RP Xperience Centre and sharing your feedback.';
}

function buildVisitSummary(options = {}) {
    const topicLabel = formatTopicList(options.pledgeTopics) || formatTopic(options.pledgeTopic) || 'General ESG feedback';
    const includeBadge = options.includeBadge !== false;
    const badgeName = includeBadge
        ? (options.badgeNames || options.badgeName || getBadgeSummaries({
            pledge: options.pledgeText,
            pledgeTopic: options.pledgeTopic,
            pledgeTopics: options.pledgeTopics
        }).map(badge => badge.badgeName).join(', '))
        : '';

    return {
        visitDate: formatVisitDate(options.visitDate),
        pledgeTopic: topicLabel,
        retention: formatRetentionSummary(options.retention, options.retentionDays),
        badgeName,
        treeLeafMessage: options.treeLeafMessage || 'Your virtual leaf has been added to the RP Xperience Centre digital tree.'
    };
}

function buildSummaryRows(summary, emailContent = {}) {
    return [
        [emailContent.visitSummaryDateLabel || 'Visit date', summary.visitDate],
        [emailContent.visitSummaryTopicLabel || 'Pledge topic', summary.pledgeTopic],
        [emailContent.visitSummaryBadgeLabel || 'Badge earned', summary.badgeName],
        [emailContent.visitSummaryRetentionLabel || 'Data retention', summary.retention],
        [emailContent.visitSummaryTreeLabel || 'Digital tree', summary.treeLeafMessage]
    ].filter(([, value]) => value);
}

function buildCombinedBadgeSectionHtml(badges = []) {
    if (!Array.isArray(badges) || badges.length === 0) return '';
    // <Jun Kai start> clean and colour-free (12 Nov 2026): the badge name and what it is for, no icon
    const items = badges.map((badge) => `
                                <p style="margin:0 0 10px 0; font-size:14px; line-height:1.5; color:#111111;"><strong>${escapeHtml(badge.badgeName)}</strong><br/><span style="color:#555555;">${escapeHtml(badge.badgeDescription || 'ESG badge earned from this visit.')}</span></p>`).join('');
    return `
                                <p style="margin:28px 0 8px 0; font-size:12px; letter-spacing:0.08em; text-transform:uppercase; color:#666666;">Visitor passport badge${badges.length === 1 ? '' : 's'} unlocked</p>${items}`;
    // <Jun Kai end>
}

function buildCombinedBadgeSectionText(badges = []) {
    if (!Array.isArray(badges) || badges.length === 0) return '';
    return `Visitor passport badges unlocked:\n${badges.map(badge => `- ${badge.badgeName}: ${badge.badgeDescription || 'ESG badge earned from this visit.'}`).join('\n')}\n`;
}

function applyEmailPlaceholders(text, badgeConfig, userData) {
    const replacements = {
        name: userData?.name || 'there',
        badge: badgeConfig.name,
        pledge: userData?.pledge || 'your ESG pledge',
        topic: formatTopic(userData?.pledgeTopic) || 'ESG',
        leaf: badgeConfig.name
    };

    return String(text || '').replace(/\{(name|badge|pledge|topic|leaf)\}/g, (_, key) => replacements[key]);
}

function buildCustomBadgeEmail(badgeConfig, template = {}, userData) {
    const subject = applyEmailPlaceholders(template.subject || badgeConfig.subject, badgeConfig, userData);
    const message = applyEmailPlaceholders(template.message || badgeConfig.description, badgeConfig, userData);
    const highlights = (template.highlights || [])
        .map(item => applyEmailPlaceholders(item, badgeConfig, userData))
        .filter(Boolean);

    const highlightsHtml = highlights.length > 0
        ? `<ul style="padding-left:20px; margin:14px 0 0 0; color:#334155; line-height:1.7; font-size:14px;">
            ${highlights.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
           </ul>`
        : '';

    const text = `Hello ${userData?.name || ''},

Congratulations on earning the "${badgeConfig.name}" badge.

${message}

Key exhibits or takeaway messages:
${highlights.map(item => `- ${item}`).join('\n') || '- Thank you for contributing to RP Xperience Centre.'}

Best regards,
RP Xperience Centre Team`;

    const html = `
        <div style="font-family: Arial, sans-serif; max-width:600px; margin:0 auto; background:#f8fafc; padding:20px; border-radius:12px;">
            <div style="text-align:center; padding:22px; background:${badgeConfig.color}; color:#ffffff; border-radius:10px;">
                <div style="width:72px; height:72px; margin:0 auto 14px; border-radius:50%; background:rgba(255,255,255,0.18); display:flex; align-items:center; justify-content:center; font-size:34px;">
                    ${badgeConfig.icon || ''}
                </div>
                <h2 style="margin:0; font-size:26px;">${escapeHtml(badgeConfig.name)}</h2>
                <p style="margin:8px 0 0 0; opacity:0.92;">Badge Earned</p>
            </div>
            <div style="background:#ffffff; margin-top:18px; padding:24px; border-radius:10px; box-shadow:0 8px 22px rgba(15,23,42,0.08);">
                <p style="font-size:15px; color:#334155; line-height:1.7; margin:0 0 16px 0;">Hello ${escapeHtml(userData?.name || 'there')},</p>
                <p style="font-size:15px; color:#334155; line-height:1.7; margin:0 0 16px 0;">
                    ${escapeHtml(message)}
                </p>
                <div style="background:#ecfdf5; border-left:4px solid #006937; padding:16px; border-radius:8px; margin:18px 0;">
                    <h3 style="font-size:16px; color:#006937; margin:0;">Personalized exhibit highlights</h3>
                    ${highlightsHtml}
                </div>
                ${userData?.pledge ? `<p style="font-size:14px; color:#475569; line-height:1.6; margin:0 0 18px 0;"><strong>Your pledge:</strong> ${escapeHtml(userData.pledge)}</p>` : ''}
                <p style="font-size:14px; color:#475569; line-height:1.6; margin:0;">Best regards,<br><strong>RP Xperience Centre Team</strong></p>
            </div>
        </div>
    `;

    return { subject, text, html };
}

function buildCustomMultiBadgeEmail(badgeEntries, userData) {
    const badgeNames = badgeEntries.map(entry => entry.badgeConfig.name);
    const subject = `Congratulations! You've earned ${badgeNames.join(' + ')} badges!`;

    const sections = badgeEntries.map(({ badgeConfig, template }) => {
        const message = applyEmailPlaceholders(template?.message || badgeConfig.description, badgeConfig, userData);
        const highlights = (template?.highlights || [])
            .map(item => applyEmailPlaceholders(item, badgeConfig, userData))
            .filter(Boolean);

        return { badgeConfig, message, highlights };
    });

    const text = `Hello ${userData?.name || ''},

Congratulations on earning these badges:

${sections.map(section => (
`- ${section.badgeConfig.name}
  ${section.message}
${section.highlights.map(item => `  - ${item}`).join('\n')}`
)).join('\n\n')}

Best regards,
RP Xperience Centre Team`;

    const htmlSections = sections.map(section => `
        <div style="background:#ffffff; padding:18px; border-radius:10px; border-left:5px solid ${section.badgeConfig.color}; box-shadow:0 8px 22px rgba(15,23,42,0.08); margin-bottom:14px;">
            <h3 style="margin:0 0 8px 0; color:#0f172a; font-size:18px;">${escapeHtml(section.badgeConfig.name)}</h3>
            <p style="margin:0 0 12px 0; color:#334155; line-height:1.6; font-size:14px;">${escapeHtml(section.message)}</p>
            ${section.highlights.length > 0 ? `
                <ul style="padding-left:20px; margin:0; color:#475569; line-height:1.7; font-size:14px;">
                    ${section.highlights.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
                </ul>
            ` : ''}
        </div>
    `).join('');

    const html = `
        <div style="font-family: Arial, sans-serif; max-width:640px; margin:0 auto; background:#f8fafc; padding:20px; border-radius:12px;">
            <div style="text-align:center; margin-bottom:20px;">
                <h2 style="margin:0; color:#0f172a; font-size:28px;">Congratulations!</h2>
                <p style="margin:10px auto 0; max-width:500px; color:#334155; line-height:1.6; font-size:15px;">
                    You've earned multiple ESG badges. Here are your personalized exhibit highlights.
                </p>
            </div>
            ${htmlSections}
            ${userData?.pledge ? `<p style="font-size:14px; color:#475569; line-height:1.6; margin:18px 0 0 0;"><strong>Your pledge:</strong> ${escapeHtml(userData.pledge)}</p>` : ''}
        </div>
    `;

    return { subject, text, html };
}

// ==================== EMAIL CONFIGURATION ====================
let emailTransporter;
let SENDER_EMAIL;

// Initialize / reload email transporter from config file
async function reloadEmailService() {
    const cfg = getEmailConfig();
    const provider = (cfg.provider || '').toLowerCase();

    let transporter;
    let senderEmail;

    if (provider === 'gmail') {
        const user = cfg.gmail?.user;
        const pass = cfg.gmail?.pass;
        if (!user || !pass) throw new Error('Gmail config missing user/pass');

        transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user, pass },
            // <Jun Kai/> the server's certificate is checked (it was switched off here before)
        });

        senderEmail = cfg.senderEmail || user;
    } 
    else if (provider === 'outlook') {
        const user = cfg.outlook?.user;
        const pass = cfg.outlook?.pass;
        if (!user || !pass) throw new Error('Outlook config missing user/pass');

        transporter = nodemailer.createTransport({
            host: 'smtp.office365.com',
            port: 587,
            secure: false,
            auth: { user, pass },
            // <Jun Kai/> the server's certificate is checked (it was switched off here before)
        });

        senderEmail = cfg.senderEmail || user;
    } 
    else if (provider === 'custom') {
        const host = cfg.custom?.host;
        const port = cfg.custom?.port;
        const secure = !!cfg.custom?.secure;
        const user = cfg.custom?.user;
        const pass = cfg.custom?.pass;

        if (!host || !port || !user || !pass) {
            throw new Error('Custom config missing host/port/user/pass');
        }

        transporter = nodemailer.createTransport({
            host,
            port,
            secure,
            auth: { user, pass },
            tls: { rejectUnauthorized: false } // <Jun Kai/> kept only for a custom mail server, which may use its own certificate
        });

        senderEmail = cfg.senderEmail || user;
    } 
    else {
        throw new Error(`Unknown provider: ${provider}`);
    }

    emailTransporter = transporter;
    SENDER_EMAIL = senderEmail;

    console.log(`✅ Email service reloaded using provider: ${provider}`);
    return true;
}

// Backward-compatible init (server.js likely calls initEmailService())
function initEmailService() {
    reloadEmailService().catch(err => {
        console.error('❌ Failed to init email service:', err.message);
        emailTransporter = null;
        SENDER_EMAIL = null;
    });
    return true;
}

// Send thank you email with photo attachment
async function sendThankYouEmail(name, email, photoFilename, pledgeText, visitOptions = {}) {
    try {
        const parameterConfig = parametersConfigStore.readParametersConfig();
        const emailContent = parameterConfig.emailContent || {};
        const retentionDays = parameterConfig.contentSettings?.temporaryRetentionDays;
        const personalize = (value, fallback = '') => String(value || fallback).replace(/\{name\}/g, name || 'Visitor');
        const emailIntro = personalize(emailContent.thankYouIntro, 'Thank you for taking the time to visit our RP Xperience Centre and sharing your feedback. Attached below is your commemorative photo from your visit.');
        const emailClosing = personalize(emailContent.thankYouClosing, 'We hope your experience has inspired you to take meaningful steps towards sustainability. Your feedback helps us improve and create better experiences for future visitors.');
        const senderName = personalize(emailContent.senderName, 'RP Xperience Centre Team');
        const footerNote = personalize(emailContent.footerNote, 'This is an automated email sent from the RP Xperience Centre kiosk system. Please do not reply to this message.');
        const emailSubject = personalize(emailContent.thankYouSubject, `Thank you for visiting RP Xperience Centre, ${name}!`);
        let emailIntroText = emailIntro;
        const suppliedBadges = Array.isArray(visitOptions.badges) ? visitOptions.badges : [];
        const badgeSummaries = suppliedBadges.length > 0
            ? suppliedBadges
            : getBadgeSummaries({
                pledge: pledgeText,
                pledgeTopic: visitOptions.pledgeTopic,
                pledgeTopics: visitOptions.pledgeTopics
            });
        const includedBadges = visitOptions.includeBadge === false ? [] : badgeSummaries;
        const badgeNames = includedBadges.map(badge => badge.badgeName).filter(Boolean).join(', ');
        const badgeSectionHtml = buildCombinedBadgeSectionHtml(includedBadges);
        const badgeSectionText = buildCombinedBadgeSectionText(includedBadges);
        let emailIntroHtml = escapeHtml(emailIntroText);
        const emailClosingHtml = escapeHtml(emailClosing);
        const senderNameHtml = escapeHtml(senderName);
        const footerNoteHtml = escapeHtml(footerNote);
        const visitSummary = buildVisitSummary({
            ...visitOptions,
            pledgeText,
            badgeNames,
            retentionDays: visitOptions.retentionDays || retentionDays,
            treeLeafMessage: visitOptions.treeLeafMessage || emailContent.visitSummaryTreeMessage
        });
        const summaryTitle = emailContent.visitSummaryTitle || 'Your Visit Summary';
        const summaryRows = buildSummaryRows(visitSummary, emailContent);
        const textSummary = summaryRows
            .map(([label, value]) => `${label}: ${value}`)
            .join('\n');
        // <Jun Kai start> clean and colour-free (12 Nov 2026): a plain two-column list with hairlines
        const htmlSummaryRows = summaryRows
            .map(([label, value]) => `
                                    <tr>
                                        <td style="padding:10px 16px 10px 0; width:38%; border-top:1px solid #e5e5e5; font-size:13px; color:#666666; vertical-align:top;">${escapeHtml(label)}</td>
                                        <td style="padding:10px 0; border-top:1px solid #e5e5e5; font-size:14px; color:#111111; vertical-align:top;">${escapeHtml(value)}</td>
                                    </tr>`).join('');
        // <Jun Kai end>
        console.debug(`📧 Preparing to send email to ${emailForLog(email)}...`); // <Jun Kai/>
        
        // <Jun Kai start> the Email page preview (visitOptions.previewTransport) keeps the message instead of sending it
        if (!emailTransporter && !visitOptions.previewTransport) {
        // <Jun Kai end>
            try {
                await reloadEmailService();
            } catch (e) {
                console.error('❌ Email transporter not initialized and reload failed:', e.message);
                return {
                    success: false,
                    error: 'Email transporter not initialized. Please check SMTP configuration.'
                };
            }
        }

        
        if (!email || !email.includes('@')) {
            console.error('❌ Invalid email address:', emailForLog(email)); // <Jun Kai/>
            return {
                success: false,
                error: 'Invalid email address'
            };
        }
        
        if (!photoFilename) {
            console.debug('📧 No photo filename supplied; sending badge and visit email without photo attachment.');
        }
        
        let fullPhotoPath = null;
        // <Jun Kai start> only a plain file name, looked for only inside the uploads folder of this project. A name from
        // a request could point at any file of the PC before, and that file was then mailed as the attachment.
        const photoName = plainName(photoFilename);
        const uploadsRoot = path.resolve(paths.UPLOADS);
        if (photoName) {
            const searchPaths = [
                path.resolve(uploadsRoot, 'photos', photoName),
                path.resolve(uploadsRoot, 'processed', photoName),
                path.resolve(uploadsRoot, photoName)
            ];

            console.debug('🔍 Searching for photo:', forLog(photoName)); // <Jun Kai/>

            for (const photoPath of searchPaths) {
                if (photoPath.startsWith(uploadsRoot + path.sep) && fs.existsSync(photoPath)) {
        // <Jun Kai end>
                    fullPhotoPath = photoPath;
                    console.debug(`✅ Found photo at: ${forLog(fullPhotoPath)}`); // <Jun Kai/>
                    break;
                }
            }

            if (!fullPhotoPath) {
                console.warn('⚠️ Photo file not found; sending email without photo attachment. Searched in:');
                searchPaths.forEach(p => console.debug('   -', forLog(p))); // <Jun Kai/>
            }

            // Check file size
            if (fullPhotoPath) {
                try {
                    const stats = fs.statSync(fullPhotoPath);
                    const fileSizeInMB = stats.size / (1024 * 1024);
                    console.debug(`📏 Photo size: ${fileSizeInMB.toFixed(2)}MB`);

                    if (fileSizeInMB > 25) {
                        console.warn(`⚠️ Photo file too large (${fileSizeInMB.toFixed(2)}MB); sending email without photo attachment.`);
                        fullPhotoPath = null;
                    }
                } catch (err) {
                    console.error('❌ Error checking file size:', err.message);
                    fullPhotoPath = null;
                }
            }
        }

        if (!fullPhotoPath) {
            emailIntroText = stripPhotoAttachmentSentence(emailIntroText);
            emailIntroHtml = escapeHtml(emailIntroText);
        }
        
        // Plain text version of email
        const textBody = `
Dear ${name},

${emailIntroText}

Your pledge:
"${pledgeText || '—'}"

${summaryTitle}:
${textSummary}

${badgeSectionText}
${emailClosing}

Warm regards,
${senderName}
Republic Polytechnic

${footerNote}
        `;

        // Pledge text
        const safePledgeText = pledgeText
  ? pledgeText.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
  : '';

        // <Jun Kai start> clean and colour-free (12 Nov 2026): greys only, plain headings, tables so every mail app lays it
        // out the same; the words are the same as before
        const pledgeHtml = pledgeText
            ? `
                                <p style="margin:28px 0 8px 0; font-size:12px; letter-spacing:0.08em; text-transform:uppercase; color:#666666;">Your pledge</p>
                                <p style="margin:0; font-size:16px; line-height:1.55; color:#111111;">&ldquo;${safePledgeText}&rdquo;</p>`
            : '';

        const photoMemoryHtml = fullPhotoPath
            ? `
                                <p style="margin:28px 0 8px 0; font-size:12px; letter-spacing:0.08em; text-transform:uppercase; color:#666666;">Your RP Xperience Centre memory</p>
                                <img src="cid:visit_photo" alt="Your RP Xperience Centre memory" style="display:block; max-width:100%; max-height:400px; height:auto; border:1px solid #e5e5e5;" />${pledgeHtml}`
            : (pledgeHtml || `
                                <p style="margin:28px 0 0 0;">Your feedback has been recorded in your visitor passport.</p>`);

        // HTML email template
        const htmlBody = `
<!DOCTYPE html>
<html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Thank you for visiting RP Xperience Centre</title>
    </head>
    <body style="margin:0; padding:24px 12px; background-color:#f4f4f4; font-family:Arial, Helvetica, sans-serif; color:#111111;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
            <tr>
                <td align="center">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px; border-collapse:collapse; background-color:#ffffff; border:1px solid #e5e5e5; text-align:left;">
                        <tr>
                            <td style="padding:32px 36px 0 36px;">
                                <p style="margin:0 0 16px 0; font-size:12px; letter-spacing:0.08em; text-transform:uppercase; color:#666666;">Republic Polytechnic &middot; RP Xperience Centre</p>
                                <h1 style="margin:0; font-size:22px; line-height:1.35; font-weight:bold; color:#111111;">Thank you for visiting the RP Xperience Centre, ${escapeHtml(name)}!</h1>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:24px 36px 32px 36px; font-size:15px; line-height:1.6; color:#333333;">
                                <p style="margin:0 0 14px 0;">Dear ${escapeHtml(name)},</p>
                                <p style="margin:0;">${emailIntroHtml}</p>
                                ${photoMemoryHtml}
                                ${badgeSectionHtml}
                                <p style="margin:28px 0 8px 0; font-size:12px; letter-spacing:0.08em; text-transform:uppercase; color:#666666;">${escapeHtml(summaryTitle)}</p>
                                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">${htmlSummaryRows}
                                </table>
                                <p style="margin:28px 0 0 0;">${emailClosingHtml}</p>
                                <p style="margin:24px 0 0 0;">Warm regards,<br/><strong style="color:#111111;">${senderNameHtml}</strong><br/>Republic Polytechnic</p>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:18px 36px; border-top:1px solid #e5e5e5; font-size:12px; line-height:1.5; color:#777777;">${footerNoteHtml}</td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
</html>
        `;
        // <Jun Kai end>

        const mailOptions = {
            from: `"RP Xperience Centre" <${SENDER_EMAIL}>`,
            to: email,
            replyTo: 'no-reply@rp.edu.sg',
            subject: emailSubject,
            text: textBody,
            html: htmlBody,
            attachments: fullPhotoPath ? [
                {
                    filename: photoFilename,
                    path: fullPhotoPath,
                    cid: 'visit_photo',
                    contentType: getPhotoAttachmentContentType(photoFilename), // changes made by nick
                    contentDisposition: 'inline' // Ensure boomerang GIF renders inside visitor email - changes made by nick
                }
            ] : []
        };

        console.debug(`📤 Sending email to: ${emailForLog(email)}`); // <Jun Kai/>
        // <Jun Kai start>
        const info = await (visitOptions.previewTransport || emailTransporter).sendMail(mailOptions);
        // <Jun Kai end>
        
        console.debug('✅ Email sent successfully!');
        console.debug('📨 Message ID:', info.messageId);
        console.debug('👤 Recipient:', emailForLog(email)); // <Jun Kai/>
        
        return {
            success: true,
            messageId: info.messageId,
            email: email,
            photoFilename: photoFilename,
            recipientCount: info.accepted.length
        };
        
    } catch (err) {
        console.error('❌ Failed to send email:', err.message);
        console.error('Error details:', err);
        
        return {
            success: false,
            error: err.message,
            details: err.response || err.code || 'Unknown error'
        };
    }
}

// Send email and update database flag
async function sendEmailAndUpdateFlag(db, name, email, photoFilename, pledgeText) {
    try {
        console.debug(`📧 Starting email process for ${emailForLog(email)} with photo ${forLog(photoFilename)}`); // <Jun Kai/>
        
        if (!db) {
            console.error('❌ Database connection not provided');
            return {
                success: false,
                error: 'Database connection not available'
            };
        }
        
        const result = await sendThankYouEmail(name, email, photoFilename, pledgeText);

        // <Jun Kai start> without a plain photo name the LIKE '%%' below matched every row and marked them all as sent
        if (result.success && !plainName(photoFilename)) {
            return { ...result, dbUpdated: false, rowsAffected: 0 };
        }
        // <Jun Kai end>
        if (result.success) {
            // Update email_sent flag in database
            return new Promise((resolve, reject) => {
                const updateQuery = `
                    UPDATE feedback 
                    SET email_sent = 1, 
                        email_sent_at = CURRENT_TIMESTAMP 
                    WHERE photo_path LIKE ? 
                       OR processed_photo_path LIKE ? 
                       OR metadata LIKE ?
                `;
                
                db.run(
                    updateQuery,
                    [`%${photoFilename}%`, `%${photoFilename}%`, `%${photoFilename}%`],
                    function(err) {
                        if (err) {
                            console.error('❌ Error updating email_sent flag:', err.message);
                            // Still return success since email was sent
                            resolve({
                                ...result,
                                dbUpdated: false,
                                dbError: err.message
                            });
                        } else {
                            const changes = this.changes || 0;
                            console.debug(`✅ Email sent flag updated in database`);
                            console.debug(`📊 Rows affected: ${changes}`);
                            
                            resolve({
                                ...result,
                                dbUpdated: true,
                                rowsAffected: changes
                            });
                        }
                    }
                );
            });
        }
        
        return result;
        
    } catch (err) {
        console.error('❌ Error in sendEmailAndUpdateFlag:', err.message);
        return {
            success: false,
            error: err.message
        };
    }
}

// Test email function
async function testEmailService(testEmail = 'test@example.com') {
    try {
        console.debug('🧪 Testing email service...');
        
        if (!emailTransporter) {
            console.debug('🔄 Initializing email service...');
            await reloadEmailService();
        }
        
        // Verify connection
        const verifyResult = await emailTransporter.verify();
        console.debug('✅ Email service verification passed');
        
        // Try to send a test email without attachment
        const testMailOptions = {
            from: `"RP Xperience Centre" <${SENDER_EMAIL}>`,
            to: testEmail,
            subject: 'Test Email from RP Xperience Centre',
            text: 'This is a test email from the RP Xperience Centre system. If you receive this, email service is working correctly.',
            // <Jun Kai start> the same clean, colour-free look as the thank-you email (12 Nov 2026)
            html: `
                <div style="font-family:Arial, Helvetica, sans-serif; max-width:600px; margin:0 auto; padding:28px 32px; border:1px solid #e5e5e5; color:#333333; font-size:15px; line-height:1.6;">
                    <p style="margin:0 0 14px 0; font-size:12px; letter-spacing:0.08em; text-transform:uppercase; color:#666666;">Republic Polytechnic &middot; RP Xperience Centre</p>
                    <h1 style="margin:0 0 16px 0; font-size:20px; line-height:1.35; color:#111111;">Test Email from RP Xperience Centre</h1>
                    <p style="margin:0 0 10px 0;">This is a test email from the RP Xperience Centre system.</p>
                    <p style="margin:0 0 10px 0;">If you receive this, email service is working correctly.</p>
                    <p style="margin:0;"><strong style="color:#111111;">Server Time:</strong> ${new Date().toLocaleString()}</p>
                    <p style="margin:20px 0 0 0; padding-top:14px; border-top:1px solid #e5e5e5; font-size:12px; color:#777777;">This is an automated test message.</p>
                </div>
            `
            // <Jun Kai end>
        };
        
        console.debug(`📤 Sending test email to: ${emailForLog(testEmail)}`); // <Jun Kai/>
        const info = await emailTransporter.sendMail(testMailOptions);
        
        console.debug('✅ Test email sent successfully!');
        console.debug('📨 Message ID:', info.messageId);
        
        return {
            success: true,
            message: 'Email service is working correctly',
            messageId: info.messageId,
            recipient: testEmail,
            testTime: new Date().toISOString()
        };
    } catch (error) {
        console.error('❌ Email service test failed:', error.message);
        console.error('Error details:', error);
        
        return {
            success: false,
            error: error.message,
            code: error.code,
            testTime: new Date().toISOString()
        };
    }
}

// Check if email can be sent (without actually sending)
async function checkEmailService() {
    try {
        if (!emailTransporter) {
            await reloadEmailService();
        }
        
        const isVerified = await emailTransporter.verify();
        const cfg = getEmailConfig();
        return {
            available: true,
            verified: isVerified,
            sender: SENDER_EMAIL,
            service: cfg.provider
        };

    } catch (error) {
        return {
            available: false,
            error: error.message,
            sender: SENDER_EMAIL
        };
    }
}

async function sendLostFoundAlertEmail(report = {}) { // Staff Lost & Found alert email (DONE BY NICK)
    try {
        if (!emailTransporter) {
            await reloadEmailService();
        }

        if (!emailTransporter || !SENDER_EMAIL) {
            return { success: false, error: 'Email service not initialized' };
        }

        const trackingCode = report.tracking_code || report.trackingCode || `LF-${String(report.id || 0).padStart(5, '0')}`;
        const type = String(report.report_type || report.type || 'lost').toUpperCase();
        const item = report.item_description || report.item || 'Not provided';
        const location = report.location_text || report.location || 'Not provided';
        const contact = report.contact_info || report.contact || 'Not provided';
        const details = report.details || 'No extra details provided.';
        const page = report.current_page || report.currentPage || 'Unknown page';
        const photoPath = report.item_photo_path || report.itemPhotoPath || '';
        const photoLink = photoPath
            ? `<p style="margin:12px 0 0 0;"><a href="${escapeHtml(photoPath)}" style="color:#0f766e; font-weight:700;">View attached item photo</a></p>`
            : '';

        const html = `
            <div style="font-family:Arial,sans-serif; max-width:640px; margin:0 auto; color:#0f172a;">
                <h2 style="margin:0 0 12px 0; color:#0f766e;">New Lost &amp; Found Report</h2>
                <p style="margin:0 0 18px 0; color:#475569;">A visitor submitted a Lost &amp; Found report from the feedback kiosk.</p>
                <table style="width:100%; border-collapse:collapse; border:1px solid #d1fae5;">
                    <tbody>
                        <tr><td style="padding:10px; background:#ecfdf5; font-weight:700;">Tracking Code</td><td style="padding:10px;">${escapeHtml(trackingCode)}</td></tr>
                        <tr><td style="padding:10px; background:#ecfdf5; font-weight:700;">Type</td><td style="padding:10px;">${escapeHtml(type)}</td></tr>
                        <tr><td style="padding:10px; background:#ecfdf5; font-weight:700;">Item</td><td style="padding:10px;">${escapeHtml(item)}</td></tr>
                        <tr><td style="padding:10px; background:#ecfdf5; font-weight:700;">Location</td><td style="padding:10px;">${escapeHtml(location)}</td></tr>
                        <tr><td style="padding:10px; background:#ecfdf5; font-weight:700;">Contact</td><td style="padding:10px;">${escapeHtml(contact)}</td></tr>
                        <tr><td style="padding:10px; background:#ecfdf5; font-weight:700;">Kiosk Page</td><td style="padding:10px;">${escapeHtml(page)}</td></tr>
                        <tr><td style="padding:10px; background:#ecfdf5; font-weight:700;">Details</td><td style="padding:10px;">${escapeHtml(details)}</td></tr>
                    </tbody>
                </table>
                ${photoLink}
            </div>
        `;

        const info = await emailTransporter.sendMail({
            from: `"RP Xperience Centre" <${SENDER_EMAIL}>`,
            to: SENDER_EMAIL,
            subject: `Lost & Found report ${trackingCode}: ${type} item`,
            text: `New Lost & Found report ${trackingCode}\nType: ${type}\nItem: ${item}\nLocation: ${location}\nContact: ${contact}\nPage: ${page}\nDetails: ${details}`,
            html
        });

        return { success: true, messageId: info.messageId, trackingCode };
    } catch (error) {
        console.error('Error sending Lost & Found alert email:', error);
        return { success: false, error: error.message };
    }
}

// <Jun Kai start> two small helpers for the emails of a forgotten admin password (backend/features/passwordReset):
// whether email is set up on this PC (without a network check, so the answer is quick), and one plain send
async function emailReady() {
    try {
        if (!emailTransporter) await reloadEmailService();
    } catch (error) {
        return false;
    }
    return !!(emailTransporter && SENDER_EMAIL);
}

async function sendAdminMail({ to, subject, text, html }) {
    try {
        if (!(await emailReady())) return { success: false, error: 'Email service not initialized' };
        const info = await emailTransporter.sendMail({ from: '"RP Xperience Centre" <' + SENDER_EMAIL + '>', to, subject, text, html });
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Error sending an admin account email:', error.message);
        return { success: false, error: error.message };
    }
}
// <Jun Kai end>

// ==================== BADGE EMAIL SENDING FUNCTION ====================
// Done by XY - Sends customized badge congratulation emails
// Features:
// - Automatic badge determination based on user pledge content
// - Multiple topic badges can be awarded for cross-topic pledges
// - HTML email templates with badge-specific styling and icons
// - Image-based badge representations
// - Error handling and delivery confirmation
// - Integrated into feedback submission workflow
// - Social media sharing buttons added to all badge emails - done by XY
const sendBadgeEmail = async (recipientEmail, userData) => {
    try {
        if (!emailTransporter) {
            await reloadEmailService();
        }

        const badgeKeys = determineBadgeKeys(userData);
        const badgeConfigs = badgeKeys.map(key => BADGE_CONFIGS[key]).filter(Boolean);
        const badgeTemplates = getBadgeEmailTemplates();

        if (badgeConfigs.length === 0) {
            console.error('No badge configuration found for user data:', badgeKeys);
            return { success: false, error: 'No badge configuration found' };
        }

        let subject;
        let text;
        let html;

        if (badgeConfigs.length === 1) {
            const badgeConfig = badgeConfigs[0];
            const customEmail = buildCustomBadgeEmail(badgeConfig, badgeTemplates[badgeKeys[0]], userData);
            subject = customEmail.subject;
            text = customEmail.text;
            html = customEmail.html;
        } else {
            const badgeEntries = badgeKeys
                .map(key => ({ badgeConfig: BADGE_CONFIGS[key], template: badgeTemplates[key] || {} }))
                .filter(entry => entry.badgeConfig);
            const customEmail = buildCustomMultiBadgeEmail(badgeEntries, userData);
            subject = customEmail.subject;
            text = customEmail.text;
            html = customEmail.html;
        }

        const mailOptions = {
            from: `"RP Xperience Centre" <${SENDER_EMAIL}>`,
            to: recipientEmail,
            subject,
            text,
            html
        };

        const info = await emailTransporter.sendMail(mailOptions);
        console.debug(`🏆 Badge email sent to ${recipientEmail}: ${info.messageId}`);
        return {
            success: true,
            messageId: info.messageId,
            badges: badgeConfigs.map(badge => badge.name),
            badgeKeys: badgeKeys
        };
    } catch (error) {
        console.error('Error sending badge email:', error);
        return { success: false, error: error.message };
    }
};

module.exports = {
    initEmailService,
    reloadEmailService,
    sendThankYouEmail,
    sendEmailAndUpdateFlag,
    sendLostFoundAlertEmail,
    sendBadgeEmail,
    determineBadge,
    determineBadgeKeys,
    getBadgeSummary,
    getBadgeSummaries,
    BADGE_CONFIGS: ACTIVE_BADGE_CONFIGS,
    ACTIVE_BADGE_KEYS,
    testEmailService,
    checkEmailService,
    emailReady, // <Jun Kai/>
    sendAdminMail // <Jun Kai/>
};
