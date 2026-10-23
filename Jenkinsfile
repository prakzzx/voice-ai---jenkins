// Jenkinsfile - CI/CD for Prakati
// Runs inside the Jenkins container, which talks to the host's Docker through
// /var/run/docker.sock and reads secrets from /var/jenkins_env/prakati.env
// (a file on the server that is never stored in Git).
//
// Flow: preflight -> backend tests -> build images -> deploy -> smoke test

pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
    timeout(time: 30, unit: 'MINUTES')
    buildDiscarder(logRotator(numToKeepStr: '15'))
  }

  environment {
    ENV_FILE = '/var/jenkins_env/prakati.env'
    COMPOSE  = 'docker compose -p prakati --env-file /var/jenkins_env/prakati.env'
  }

  stages {

    stage('Preflight') {
      steps {
        sh '''
          test -f "$ENV_FILE" || { echo "Missing $ENV_FILE - edit /opt/prakati/.env on the server"; exit 1; }
          docker version --format 'Docker server {{.Server.Version}}'
          $COMPOSE config -q
        '''
      }
    }

    stage('Backend tests') {
      // Builds the "test" stage of backend/Dockerfile, which runs npm test.
      steps {
        sh 'docker build --target test -t prakati-backend-test:$BUILD_NUMBER backend'
      }
    }

    stage('Build images') {
      // The web image runs "npm run build", so a broken frontend fails here.
      steps {
        sh '$COMPOSE build'
      }
    }

    stage('Deploy') {
      // The job tracks one branch (REPO_BRANCH, default main), so every green build is deployed.
      // Database migrations run automatically when the backend container starts.
      steps {
        sh '$COMPOSE up -d --remove-orphans'
      }
    }

    stage('Smoke test') {
      steps {
        sh '''
          status=starting
          for i in $(seq 1 30); do
            status=$(docker inspect --format '{{.State.Health.Status}}' prakati-backend 2>/dev/null || echo starting)
            echo "backend health: $status ($i/30)"
            [ "$status" = "healthy" ] && break
            sleep 5
          done
          if [ "$status" != "healthy" ]; then
            echo "Backend did not become healthy. Last logs:"
            docker logs --tail 80 prakati-backend
            exit 1
          fi

          [ "$(docker inspect --format '{{.State.Running}}' prakati-web)" = "true" ] || { echo "web container is not running"; exit 1; }

          DOMAIN=$(grep '^DOMAIN=' "$ENV_FILE" | head -n1 | cut -d= -f2-)
          if [ -n "$DOMAIN" ] && [ "$DOMAIN" != "localhost" ]; then
            for i in 1 2 3 4 5 6; do
              if curl -fsS --max-time 10 "https://$DOMAIN/health"; then echo; echo "Public HTTPS check OK"; exit 0; fi
              echo "Waiting for HTTPS certificate / DNS ($i/6)..."
              sleep 10
            done
            echo "WARNING: https://$DOMAIN/health did not answer (check DNS and ports 80/443). The app itself is healthy."
          fi
        '''
      }
    }
  }

  post {
    success { echo 'Deployed successfully.' }
    failure { echo 'Build failed - open the failing stage above for the reason.' }
    always  { sh 'docker image prune -f || true' }
  }
}
