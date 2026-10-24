
pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
        timeout(time: 30, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '15'))
    }

    stages {
        stage('Preflight') {
            steps {
                sh 'docker version'
            }
        }

        stage('Backend tests') {
            steps {
                sh 'docker build --target test -t prakati-backend-test:$BUILD_NUMBER backend'
            }
        }

        stage('Frontend build') {
            steps {
                sh 'docker build -t prakati-frontend-ci:$BUILD_NUMBER frontend'
            }
        }
    }

    post {
        success {
            echo 'CI passed. No application deployment was performed.'
            script {
                try {
                    slackSend(channel: env.SLACK_CHANNEL ?: '#voice-ai-notifications',tokenCredentialId: 'slack-bot-token', color: 'good',
                        message: "SUCCESS: ${env.JOB_NAME} #${env.BUILD_NUMBER}\nBackend tests and frontend build passed.\n${env.BUILD_URL}")
                } catch (err) {
                    echo "Slack notification failed: ${err.message}"
                }
            }
        }
        failure {
            echo 'CI failed. Review the failing stage logs.'
            script {
                try {
                    slackSend(channel: env.SLACK_CHANNEL ?: '#voice-ai-notifications',tokenCredentialId: 'slack-bot-token', color: 'danger',
                        message: "FAILED: ${env.JOB_NAME} #${env.BUILD_NUMBER}\nReview the Jenkins console output.\n${env.BUILD_URL}")
                } catch (err) {
                    echo "Slack notification failed: ${err.message}"
                }
            }
        }
    }
}
