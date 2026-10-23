
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
        }
        failure {
            echo 'CI failed. Review the failing stage logs.'
        }
    }
}
