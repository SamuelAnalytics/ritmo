# Ritmo — seu espaço de estudos

Aplicação estática em português para montar trilhas de programação, organizar sessões e guardar o próprio histórico. Feita com HTML, CSS e JavaScript, sem bibliotecas de produção ou servidor.

## Executar localmente

1. Abra esta pasta no Zed ou em outro editor.
2. No terminal, dentro da pasta, execute `python -m http.server 8765`.
3. Acesse `http://127.0.0.1:8765`.

Servir os arquivos por HTTP local permite usar os recursos seguros do navegador, como o hash de senha para as contas locais.

## Funcionalidades implementadas

- Entrar sem cadastro e começar um plano local. O cadastro opcional também fica somente no navegador.
- Escolher um tema de programação, nível, método preferido, dias, tempo por sessão e prazo para gerar uma trilha inicial.
- Criar e editar sessões semanais recorrentes ou sessões únicas com uma data específica.
- Usar o mesmo conjunto de sessões no painel, checklist e calendário mensal. A conclusão das sessões recorrentes reinicia a cada semana; o histórico permanece salvo.
- Registrar tempo de estudo com um cronômetro que pode pausar, continuar e recuperar o estado após recarregar a página. O cronômetro registra o tempo, mas não conclui a sessão automaticamente.
- Consultar tempo cronometrado, sessões concluídas e taxa de conclusão em janelas de 7 ou 30 dias.
- Receber revisões sugeridas em intervalos de 1, 7 e 30 dias após concluir uma sessão. Ao desfazer a conclusão, as revisões ligadas a ela também são removidas.
- Explorar métodos e um kit ampliado de ferramentas para programar, abrir videoaulas e buscas do YouTube relacionadas ao tema e ao próximo tópico do plano e iniciar sessões de estudo.
- Baixar modelos CSV e exportar o plano. Células que poderiam ser interpretadas como fórmulas recebem proteção na exportação.
- Importar e exportar sessões CSV. A importação aceita delimitadores comuns, respeita aspas e mostra uma prévia antes de substituir a agenda.
- Baixar ou importar um backup JSON completo. A aplicação valida o arquivo antes de substituir os dados atuais.
- Apagar a conta local e os dados de estudo do navegador com confirmação.
- Alternar entre tema escuro e claro, navegar por teclado e usar a interface em telas menores.

## Como os indicadores são calculados

- **Tempo registrado:** soma dos segundos dos blocos concluídos no cronômetro dentro do período selecionado. O tempo planejado não é contado como tempo estudado.
- **Sessões concluídas:** registros de conclusão dentro do período.
- **Sessões elegíveis:** ocorrências semanais ou sessões com data específica até hoje. Ocorrências futuras não entram no denominador.
- **Taxa de conclusão:** conclusões no período divididas pelas sessões elegíveis, limitada a 100%. Sem sessões elegíveis, a taxa aparece como “—”.
- **Gráficos:** usam os mesmos registros do cronômetro e os filtros da tela. Sem registros, a aplicação informa que ainda não há dados.

## Privacidade e limites

Os planos, revisões, preferências, registros de tempo e contas opcionais ficam no `localStorage` deste navegador. Eles não são enviados para um servidor nem sincronizados entre dispositivos. Limpar os dados do navegador pode removê-los; use o backup JSON para transferi-los ou guardá-los.

O login opcional é uma demonstração local, não autenticação segura para produção: não há backend, recuperação de senha nem proteção contra alterações feitas pelo próprio usuário no navegador. Não use uma senha real ou repetida de outros serviços. Para experimentar o Ritmo, prefira **Continuar sem cadastro**.

Os links de videoaulas podem abrir um curso indicado ou uma busca do YouTube com a área de programação e o próximo tópico do plano. Eles levam para serviços externos; confira o vídeo antes de estudar para confirmar se o nível e a linguagem combinam com você.

O CSV transfere a agenda, mas não carrega revisões nem o histórico do cronômetro; use JSON para esses dados. Ainda não há cadastro de temas de programação separado das sessões, cancelamento ou arquivamento de sessões, horários dentro do dia, detecção de conflitos, sincronização ou comparação estatística entre períodos. As sessões sem data representam uma rotina semanal; não são eventos com horário marcado.

## GitHub Pages

O projeto é estático e usa caminhos relativos para carregar seus arquivos. Para publicar, os arquivos `index.html`, `styles.css`, `app.js` e `.nojekyll` precisam estar na raiz da branch e da pasta configuradas em **Settings → Pages**. Depois de enviar as alterações ao repositório, confira o resultado da implantação em **Actions** e abra o endereço indicado em **Settings → Pages**.

`RitmoGitHubPages` é a cópia preparada para publicação na raiz do GitHub Pages. O site não foi publicado automaticamente por este projeto local.
